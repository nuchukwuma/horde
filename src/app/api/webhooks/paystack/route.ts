/**
 * POST /api/webhooks/paystack
 *
 * Deliberately NOT authenticated by session or tenant. Paystack posts here with
 * no cookie and no idea which seller the payment belongs to; the HMAC signature
 * over the raw body is the entire authentication story, and the order reference
 * inside is what identifies the tenant.
 *
 * The body is read with request.text(), never request.json(). Parsing and
 * re-serialising reorders keys and drops whitespace, which would invalidate
 * every signature.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { ensureDatabase } from '@/lib/http/context';
import { PAYSTACK_SIGNATURE_HEADER } from '@/lib/paystack/webhookSignature';
import { processPaystackEvent } from '@/lib/webhooks/processPaystackEvent';

export const runtime = 'nodejs';
// Signature verification needs the unmodified bytes.
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    await ensureDatabase();

    const rawBody = await request.text();
    const signature = request.headers.get(PAYSTACK_SIGNATURE_HEADER);

    const result = await processPaystackEvent({ rawBody, signature });

    if (result.outcome === 'invalid_signature') {
      console.warn('[webhook] rejected an unsigned or mis-signed delivery');
    } else if (result.outcome === 'amount_mismatch') {
      // Someone paid an amount that disagrees with the order. Never silent.
      console.error(`[webhook] AMOUNT MISMATCH on event ${result.eventId}`);
    }

    return NextResponse.json({ received: true, outcome: result.outcome }, {
      status: result.httpStatus,
    });
  } catch (error) {
    // Anything uncaught is transient by assumption: answer 500 so Paystack
    // redelivers rather than dropping a real payment on the floor.
    console.error('[webhook] unhandled failure', error);
    return NextResponse.json({ received: false }, { status: 500 });
  }
}

/**
 * POST /api/checkout
 *
 * Called from a seller's storefront. The tenant comes from the host header via
 * middleware, never from the request body — a customer on one store cannot
 * check out against another.
 */

import type { NextRequest } from 'next/server';
import { ensureDatabase } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { clientIdentifier, enforceRateLimit } from '@/lib/ratelimit';
import { createCheckout } from '@/lib/checkout/createCheckout';
import { checkoutSchema } from '@/lib/validation/schemas';
import { findSiteBySlug, TENANT_SLUG_HEADER } from '@/lib/tenant/loadSite';
import { NotFoundError } from '@/lib/errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    await ensureDatabase();

    // Middleware strips any client-supplied copy of this header before setting
    // it from the Host, so it cannot be forged.
    const slug = request.headers.get(TENANT_SLUG_HEADER);
    if (!slug) {
      throw new NotFoundError('Store');
    }

    const site = await findSiteBySlug(slug);
    if (!site) throw new NotFoundError('Store');

    await enforceRateLimit('checkout:initialize', `${slug}:${clientIdentifier(request)}`);

    const body = checkoutSchema.parse(await request.json());

    const result = await createCheckout({
      site,
      items: body.items,
      customerEmail: body.customerEmail,
      customerName: body.customerName,
      callbackUrl: process.env.CHECKOUT_CALLBACK_URL,
    });

    return ok(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}

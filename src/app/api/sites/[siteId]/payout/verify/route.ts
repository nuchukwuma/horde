/**
 * POST /api/sites/:siteId/payout/verify
 *
 * Step one of payout onboarding: resolve an account number to the name the bank
 * holds for it. Persists nothing — the seller confirms the name before step two
 * creates the subaccount.
 */

import type { NextRequest } from 'next/server';
import { requireSession } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { requireOwnerMembership } from '@/lib/auth/guards';
import { assertRecentlyAuthenticated } from '@/lib/auth/session';
import { enforceRateLimit } from '@/lib/ratelimit';
import { verifyPayoutAccount } from '@/lib/onboarding/payout';
import { payoutDetailsSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  try {
    const { siteId } = await params;
    const session = await requireSession(request, 'platform');

    // Payout details decide where money goes, so only the owner touches them
    // and only with a freshly confirmed password.
    await requireOwnerMembership(session, siteId);
    assertRecentlyAuthenticated(session);

    // Keyed by site, not IP: this spends Paystack quota and an unthrottled
    // resolve endpoint is a bank-account enumerator.
    await enforceRateLimit('payout:verify', `site:${siteId}`);

    const input = payoutDetailsSchema
      .pick({ bankCode: true, accountNumber: true })
      .parse(await request.json());

    const verified = await verifyPayoutAccount(input);

    return ok(verified);
  } catch (error) {
    return toErrorResponse(error);
  }
}

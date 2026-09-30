/**
 * Payout details for a site.
 *
 * GET  — what is on file (never the account number)
 * POST — step two of onboarding: verify, create the Paystack subaccount, persist
 */

import type { NextRequest } from 'next/server';
import { requireSession, requestIp, requestUserAgent } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { requireSiteOwner } from '@/lib/auth/guards';
import { assertRecentlyAuthenticated } from '@/lib/auth/session';
import { enforceRateLimit } from '@/lib/ratelimit';
import { savePayoutDetails } from '@/lib/onboarding/payout';
import { payoutDetailsSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  try {
    const { siteId } = await params;
    const session = await requireSession(request, 'platform');
    const { site } = await requireSiteOwner(session, siteId);

    const gate = site.canAcceptPayments();

    return ok({
      status: site.payout.status,
      businessName: site.payout.businessName ?? null,
      bankCode: site.payout.bankCode ?? null,
      accountNumberLast4: site.payout.accountNumberLast4 ?? null,
      resolvedAccountName: site.payout.resolvedAccountName ?? null,
      verifiedAt: site.payout.verifiedAt ?? null,
      checkoutEnabledFrom: site.checkoutEnabledFrom ?? null,
      canAcceptPayments: gate.allowed,
      blockedReason: gate.reason ?? null,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  try {
    const { siteId } = await params;
    const session = await requireSession(request, 'platform');

    // Redirecting a seller's payouts is the highest-value action in the product
    // for an attacker, so: owner only, password re-confirmed, rate limited, and
    // written to the audit log by the service below.
    const access = await requireSiteOwner(session, siteId);
    assertRecentlyAuthenticated(session);
    await enforceRateLimit('payout:update', `site:${siteId}`);

    const input = payoutDetailsSchema.parse(await request.json());

    const result = await savePayoutDetails({
      siteId,
      businessName: input.businessName,
      bankCode: input.bankCode,
      accountNumber: input.accountNumber,
      actorUserId: session.user._id,
      actorRole: access.role,
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
    });

    return ok(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}

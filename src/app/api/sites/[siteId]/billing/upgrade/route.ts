/**
 * POST /api/sites/:siteId/billing/upgrade — start a Premium subscription.
 *
 * Owner only. Returns Paystack's checkout URL; the upgrade itself happens
 * only after Paystack confirms the payment (lib/billing/subscription.ts).
 */

import type { NextRequest } from 'next/server';
import { requireSession } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { requireSiteOwner } from '@/lib/auth/guards';
import { enforceRateLimit } from '@/lib/ratelimit';
import { startPremiumCheckout } from '@/lib/billing/subscription';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  try {
    const { siteId } = await params;
    const session = await requireSession(request, 'platform');
    const access = await requireSiteOwner(session, siteId);
    await enforceRateLimit('checkout:initialize', `billing:${siteId}`);

    // Back to this store's billing page on the app host — built from the
    // request's own origin, which middleware has already resolved as the app.
    const callbackUrl = `${new URL(request.url).origin}/dashboard/${siteId}/billing`;
    const result = await startPremiumCheckout(access.site, session.user._id, callbackUrl);
    return ok(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * POST /api/sites/:siteId/orders/:orderId/refund
 *
 * Refunding moves real money out, so it is owner-or-admin only and every call
 * lands in the audit log. Staff can hold `orders:refund` if the owner grants it.
 */

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession, requestIp, requestUserAgent } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { assertPermission, requireSiteAccess } from '@/lib/auth/guards';
import { enforceRateLimit } from '@/lib/ratelimit';
import { issueRefund } from '@/lib/refunds/issueRefund';
import { ForbiddenError } from '@/lib/errors';

export const runtime = 'nodejs';

const refundSchema = z.object({
  /** Kobo. Omit for a full refund of the remaining balance. */
  amountKobo: z.number().int().positive().optional(),
  reason: z.string().trim().min(3).max(500),
  /**
   * Overriding who absorbs the commission is a platform decision, not a
   * seller's — the guard below enforces that.
   */
  policyOverride: z.enum(['retain', 'return_proportional', 'return_full']).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string; orderId: string }> },
) {
  try {
    const { siteId, orderId } = await params;
    const session = await requireSession(request, 'platform');

    const access = await requireSiteAccess(session, siteId, ['owner', 'staff']);
    assertPermission(access, 'orders:refund');

    await enforceRateLimit('payout:update', `refund:${siteId}`);

    const body = refundSchema.parse(await request.json());

    if (body.policyOverride && access.role !== 'platform_admin') {
      throw new ForbiddenError('Only a platform admin may override the refund policy');
    }

    const result = await issueRefund({
      siteId,
      siteSlug: access.site.slug,
      orderId,
      amountKobo: body.amountKobo,
      reason: body.reason,
      actorUserId: session.user._id,
      actorRole: access.role,
      policyOverride: body.policyOverride,
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
    });

    return ok(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}

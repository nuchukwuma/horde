/**
 * POST /api/sites/:siteId/billing/cancel — stop Premium renewing.
 *
 * Owner only, password re-confirmed. The store keeps Premium until the end
 * of the period it paid for.
 */

import type { NextRequest } from 'next/server';
import { requireSession } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { requireSiteOwner } from '@/lib/auth/guards';
import { assertRecentlyAuthenticated } from '@/lib/auth/session';
import { cancelPremium } from '@/lib/billing/subscription';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  try {
    const { siteId } = await params;
    const session = await requireSession(request, 'platform');
    const access = await requireSiteOwner(session, siteId);
    assertRecentlyAuthenticated(session);

    await cancelPremium(access.site);
    return ok({ status: 'non_renewing' });
  } catch (error) {
    return toErrorResponse(error);
  }
}

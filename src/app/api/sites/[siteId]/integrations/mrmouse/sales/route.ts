/**
 * GET  /api/sites/:siteId/integrations/mrmouse/sales  sales still on their way to MrMouse
 * POST /api/sites/:siteId/integrations/mrmouse/sales  try the ones that gave up again
 *
 * Owner only, like every other MrMouse setting.
 */

import type { NextRequest } from 'next/server';
import { requireSession } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { requireOwnerMembership } from '@/lib/auth/guards';
import { mrmouseSaleBacklog, retryFailedMrMouseSales } from '@/lib/integrations/mrmouseSales';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  try {
    const { siteId } = await params;
    const session = await requireSession(request, 'platform');
    await requireOwnerMembership(session, siteId);
    return ok(await mrmouseSaleBacklog(siteId));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  try {
    const { siteId } = await params;
    const session = await requireSession(request, 'platform');
    await requireOwnerMembership(session, siteId);
    await retryFailedMrMouseSales(siteId);
    return ok(await mrmouseSaleBacklog(siteId));
  } catch (error) {
    return toErrorResponse(error);
  }
}

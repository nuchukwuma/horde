/**
 * GET /api/sites/:siteId/dashboard — headline figures for a seller.
 */

import type { NextRequest } from 'next/server';
import { requireSession } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { assertPermission, requireSiteAccess } from '@/lib/auth/guards';
import { dashboardSummary } from '@/lib/dashboard/seller';
import { withSite } from '@/lib/tenant/loadSite';
import { parseDateRange } from '@/lib/http/query';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  try {
    const { siteId } = await params;
    const session = await requireSession(request, 'platform');

    const access = await requireSiteAccess(session, siteId, ['owner', 'staff']);
    assertPermission(access, 'orders:read');

    const range = parseDateRange(request.nextUrl.searchParams);

    // Entering tenant scope here is what makes every query below automatically
    // filtered to this site.
    const summary = await withSite(access.site, () => dashboardSummary(range));

    return ok(summary);
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * POST /api/sites/:siteId/orders/:orderId/fulfil — mark an order sent or
 * collected ({ fulfilled: true }), or undo it ({ fulfilled: false }).
 *
 * Moves no money, so it needs `orders:fulfil` rather than the refund
 * permission; the order is looked up inside this site's tenant scope.
 */

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { assertPermission, requireSiteAccess } from '@/lib/auth/guards';
import { withSite } from '@/lib/tenant/loadSite';
import { setOrderFulfilled } from '@/lib/orders/sellerOrders';

export const runtime = 'nodejs';

const fulfilSchema = z.object({ fulfilled: z.boolean() });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string; orderId: string }> },
) {
  try {
    const { siteId, orderId } = await params;
    const session = await requireSession(request, 'platform');
    const access = await requireSiteAccess(session, siteId, ['owner', 'staff']);
    assertPermission(access, 'orders:fulfil');

    const { fulfilled } = fulfilSchema.parse(await request.json());
    const order = await withSite(access.site, () => setOrderFulfilled(orderId, fulfilled));
    return ok(order);
  } catch (error) {
    return toErrorResponse(error);
  }
}

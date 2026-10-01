/**
 * Product catalogue for the seller's dashboard.
 *
 * GET  — every product that is not archived, drafts included
 * POST — create. The body carries a naira string; the service converts it to
 *        kobo once, and the slug is generated rather than accepted.
 */

import type { NextRequest } from 'next/server';
import { requireSession } from '@/lib/http/context';
import { created, ok, toErrorResponse } from '@/lib/http/respond';
import { assertPermission, requireSiteAccess } from '@/lib/auth/guards';
import { withSite } from '@/lib/tenant/loadSite';
import { createProduct, listProductsForSeller } from '@/lib/products/products';
import { createProductSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  try {
    const { siteId } = await params;
    const session = await requireSession(request, 'platform');
    const access = await requireSiteAccess(session, siteId, ['owner', 'staff']);
    assertPermission(access, 'products:read');

    const products = await withSite(access.site, () => listProductsForSeller());
    return ok(products);
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
    const access = await requireSiteAccess(session, siteId, ['owner', 'staff']);
    assertPermission(access, 'products:write');

    const body = createProductSchema.parse(await request.json());
    const product = await withSite(access.site, () => createProduct(access.site, body));

    return created(product, `/api/sites/${siteId}/products/${product.id}`);
  } catch (error) {
    return toErrorResponse(error);
  }
}

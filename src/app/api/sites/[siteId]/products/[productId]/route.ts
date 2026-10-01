/**
 * One product.
 *
 * PATCH  — partial update; price changes go through the same kobo conversion
 * DELETE — archive. Never a hard delete: see archiveProduct.
 *
 * The product is looked up inside the site's tenant scope, so an id belonging
 * to another store is simply not found rather than editable.
 */

import type { NextRequest } from 'next/server';
import { requireSession } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { assertPermission, requireSiteAccess } from '@/lib/auth/guards';
import { withSite } from '@/lib/tenant/loadSite';
import { archiveProduct, updateProduct } from '@/lib/products/products';
import { updateProductSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

type Params = { params: Promise<{ siteId: string; productId: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { siteId, productId } = await params;
    const session = await requireSession(request, 'platform');
    const access = await requireSiteAccess(session, siteId, ['owner', 'staff']);
    assertPermission(access, 'products:write');

    const body = updateProductSchema.parse(await request.json());
    const product = await withSite(access.site, () => updateProduct(productId, body));

    return ok(product);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { siteId, productId } = await params;
    const session = await requireSession(request, 'platform');
    const access = await requireSiteAccess(session, siteId, ['owner', 'staff']);
    assertPermission(access, 'products:write');

    await withSite(access.site, () => archiveProduct(productId));
    return ok({ archived: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

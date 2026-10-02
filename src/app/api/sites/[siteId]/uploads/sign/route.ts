/**
 * POST /api/sites/:siteId/uploads/sign — a one-folder, short-lived signature
 * for uploading a product photo directly to Cloudinary.
 *
 * Returns 404 when Cloudinary is not configured, which the dashboard reads as
 * "no uploads here" and falls back to generated product art.
 */

import type { NextRequest } from 'next/server';
import { requireSession } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { assertPermission, requireSiteAccess } from '@/lib/auth/guards';
import { cloudinaryConfig, signProductUpload } from '@/lib/products/images';
import { NotFoundError } from '@/lib/errors';
import { limitsFor } from '@/lib/billing/quota';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  try {
    const { siteId } = await params;
    const session = await requireSession(request, 'platform');
    const access = await requireSiteAccess(session, siteId, ['owner', 'staff']);
    const config = cloudinaryConfig();
    if (!config) throw new NotFoundError('Photo uploads');

    // Which of this site's folders the upload may land in. Design images
    // (store banners, logos) need the settings permission rather than products.
    const requested = request.nextUrl.searchParams.get('purpose');
    const purpose = requested === 'design' || requested === 'content' ? requested : 'products';
    if (purpose === 'design') assertPermission(access, 'settings:write');
    if (purpose === 'content') assertPermission(access, 'content:write');
    if (purpose === 'products') assertPermission(access, 'products:write');

    // The largest photo this store's plan accepts. Checked in the browser
    // before uploading; whatever is uploaded is stored shrunk to at most
    // 1600px by the signed transformation either way.
    const maxBytes = limitsFor(access.site).maxUploadBytes;

    return ok({ ...signProductUpload(String(access.site._id), config, Date.now(), purpose), maxBytes }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

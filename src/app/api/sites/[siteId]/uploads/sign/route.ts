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

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  try {
    const { siteId } = await params;
    const session = await requireSession(request, 'platform');
    const access = await requireSiteAccess(session, siteId, ['owner', 'staff']);
    assertPermission(access, 'products:write');

    const config = cloudinaryConfig();
    if (!config) throw new NotFoundError('Photo uploads');

    return ok(signProductUpload(String(access.site._id), config), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * POST /api/sites/:siteId/design/publish — make the saved draft live.
 *
 * Body: { revision } — the revision the seller is looking at. Publishing a
 * draft some other tab changed since is refused rather than guessed at.
 *
 * After publishing, the storefront's cached copy is invalidated by tag, so
 * the live store updates on its next request without a redeploy.
 */

import type { NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';
import { z } from 'zod';
import { requireSession } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { assertPermission, requireSiteAccess } from '@/lib/auth/guards';
import { withSite } from '@/lib/tenant/loadSite';
import { publishDesign } from '@/lib/design/service';
import { designTag } from '@/lib/design/published';

export const runtime = 'nodejs';

const bodySchema = z.object({ revision: z.number().int().min(1) }).strict();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  try {
    const { siteId } = await params;
    const session = await requireSession(request, 'platform');
    const access = await requireSiteAccess(session, siteId, ['owner', 'staff']);
    assertPermission(access, 'settings:write');

    // A missing or malformed body is a 422 from the schema, not a 500.
    const { revision } = bodySchema.parse(await request.json().catch(() => null));
    const design = await withSite(access.site, () =>
      publishDesign(access.site, revision, session.user._id, access.role),
    );

    revalidateTag(designTag(String(access.site._id)));
    return ok(design);
  } catch (error) {
    return toErrorResponse(error);
  }
}

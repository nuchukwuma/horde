/**
 * A store's design, for its editor.
 *
 * GET — the draft (or the starting preset), the published version number,
 *       and the revision the next save must name
 * PUT — save a draft: { theme, page, revision }. Validated in full
 *       server-side (lib/design/service.ts); nothing here reaches customers
 *       until it is published.
 *
 * The site comes from the URL and is authorised against the signed-in
 * seller's memberships. The body never names a site.
 */

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { readJsonCapped } from '@/lib/http/body';
import { assertPermission, requireSiteAccess } from '@/lib/auth/guards';
import { withSite } from '@/lib/tenant/loadSite';
import { loadEditorDesign, saveDraft } from '@/lib/design/service';
import { MAX_PAGE_BYTES } from '@/lib/design/blocks';

export const runtime = 'nodejs';

type Params = { params: Promise<{ siteId: string }> };

const envelope = z
  .object({ theme: z.unknown(), page: z.unknown(), revision: z.number().int().min(0) })
  .strict();

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { siteId } = await params;
    const session = await requireSession(request, 'platform');
    const access = await requireSiteAccess(session, siteId, ['owner', 'staff']);
    assertPermission(access, 'settings:write');

    const design = await withSite(access.site, () => loadEditorDesign(access.site));
    return ok(design, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { siteId } = await params;
    const session = await requireSession(request, 'platform');
    const access = await requireSiteAccess(session, siteId, ['owner', 'staff']);
    assertPermission(access, 'settings:write');

    // The page cap plus room for the theme and envelope.
    const body = envelope.parse(await readJsonCapped(request, MAX_PAGE_BYTES + 16 * 1024));
    const design = await withSite(access.site, () =>
      saveDraft(access.site, { theme: body.theme, page: body.page, revision: body.revision }, session.user._id),
    );
    return ok(design);
  } catch (error) {
    return toErrorResponse(error);
  }
}

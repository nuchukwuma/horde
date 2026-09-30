/**
 * Site settings the seller controls.
 *
 * GET  — current socials, plus the public address of the store
 * PATCH — replace the socials
 *
 * PATCH replaces the whole socials object rather than merging keys, so
 * clearing a platform is sending it absent. A merge would make removal
 * impossible to express without a sentinel value.
 */

import type { NextRequest } from 'next/server';
import { requireSession } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { assertPermission, requireSiteAccess } from '@/lib/auth/guards';
import { Site } from '@/lib/db/models/Site';
import { socialsSchema, buildSocialLinks } from '@/lib/content/socials';
import { siteOrigin } from '@/lib/seo/meta';
import { runWithoutTenantScope } from '@/lib/tenant/context';
import { recordAudit } from '@/lib/audit';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  try {
    const { siteId } = await params;
    const session = await requireSession(request, 'platform');
    const access = await requireSiteAccess(session, siteId, ['owner', 'staff']);

    return ok({
      socials: access.site.socials ?? {},
      links: buildSocialLinks(access.site.socials),
      // The seller's own address, which is the thing they most often want to
      // copy out of a dashboard.
      storeUrl: siteOrigin(access.site),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  try {
    const { siteId } = await params;
    const session = await requireSession(request, 'platform');
    const access = await requireSiteAccess(session, siteId, ['owner', 'staff']);
    assertPermission(access, 'settings:write');

    const body = await request.json();
    const socials = socialsSchema.parse(body?.socials ?? {});

    // Drop absent keys so an omitted platform is stored as absent rather than
    // as an explicit undefined that Mongo would keep.
    const cleaned = Object.fromEntries(
      Object.entries(socials).filter(([, value]) => Boolean(value)),
    );

    const updated = await runWithoutTenantScope(
      'updating a Site, which is the tenant root and therefore not tenant-scoped',
      () => Site.findByIdAndUpdate(access.site._id, { $set: { socials: cleaned } }, { new: true }),
    );

    await recordAudit({
      action: 'site.settings.changed',
      siteId: access.site._id,
      actorUserId: session.user._id,
      actorRole: access.role,
      targetType: 'Site',
      targetId: siteId,
      before: { socials: access.site.socials ?? {} },
      after: { socials: cleaned },
    });

    return ok({
      socials: updated?.socials ?? cleaned,
      links: buildSocialLinks(cleaned),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

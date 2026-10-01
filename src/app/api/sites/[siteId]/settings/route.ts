/**
 * Site settings the seller controls.
 *
 * GET   — socials, branding, and the public address of the store
 * PATCH — any of: `socials` (replaced whole), `tagline`, `accent`
 *
 * `socials`, when present, replaces the whole object rather than merging
 * keys, so clearing a platform is sending it absent. A merge would make
 * removal impossible to express without a sentinel value. When `socials` is
 * absent it is left alone — saving the tagline must not wipe the links.
 */

import type { NextRequest } from 'next/server';
import { requireSession } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { assertPermission, requireSiteAccess } from '@/lib/auth/guards';
import { Site } from '@/lib/db/models/Site';
import { socialsSchema, buildSocialLinks } from '@/lib/content/socials';
import { siteBrandingSchema } from '@/lib/validation/schemas';
import { readableInkFor } from '@/lib/ui/contrast';
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
      tagline: typeof access.site.settings?.tagline === 'string' ? access.site.settings.tagline : '',
      accent: typeof access.site.theme?.accent === 'string' ? access.site.theme.accent : null,
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

    const body = (await request.json()) ?? {};
    const branding = siteBrandingSchema.parse({ tagline: body.tagline, accent: body.accent });

    const set: Record<string, unknown> = {};
    let cleaned: Record<string, string> | undefined;

    if (body.socials !== undefined) {
      const socials = socialsSchema.parse(body.socials ?? {});
      // Drop absent keys so an omitted platform is stored as absent rather than
      // as an explicit undefined that Mongo would keep.
      cleaned = Object.fromEntries(
        Object.entries(socials).filter(([, value]) => Boolean(value)),
      ) as Record<string, string>;
      set.socials = cleaned;
    }

    if (branding.tagline !== undefined) set['settings.tagline'] = branding.tagline;

    if (branding.accent !== undefined) {
      set['theme.accent'] = branding.accent.toLowerCase();
      // The text colour on accent buttons is derived, not chosen: a seller who
      // picks a pale yellow would otherwise ship white-on-yellow buttons
      // nobody can read.
      set['theme.accentInk'] = readableInkFor(branding.accent);
    }

    const updated = await runWithoutTenantScope(
      'updating a Site, which is the tenant root and therefore not tenant-scoped',
      () => Site.findByIdAndUpdate(access.site._id, { $set: set }, { new: true }),
    );

    await recordAudit({
      action: 'site.settings.changed',
      siteId: access.site._id,
      actorUserId: session.user._id,
      actorRole: access.role,
      targetType: 'Site',
      targetId: siteId,
      before: {
        socials: access.site.socials ?? {},
        tagline: access.site.settings?.tagline ?? null,
        accent: access.site.theme?.accent ?? null,
      },
      after: set,
    });

    const socials = (updated?.socials ?? cleaned ?? {}) as Record<string, string>;
    return ok({
      socials,
      links: buildSocialLinks(socials),
      tagline: typeof updated?.settings?.tagline === 'string' ? updated.settings.tagline : '',
      accent: typeof updated?.theme?.accent === 'string' ? updated.theme.accent : null,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

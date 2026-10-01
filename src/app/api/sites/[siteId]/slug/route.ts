/**
 * PATCH /api/sites/:siteId/slug — change the store's address.
 *
 * Owner only, password re-confirmed in the last ten minutes, three changes
 * per thirty days. See lib/tenant/changeSlug.ts for the rules.
 */

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession, requestIp, requestUserAgent } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { requireSiteOwner } from '@/lib/auth/guards';
import { assertRecentlyAuthenticated } from '@/lib/auth/session';
import { enforceRateLimit } from '@/lib/ratelimit';
import { changeSiteSlug } from '@/lib/tenant/changeSlug';
import { siteOrigin } from '@/lib/seo/meta';

export const runtime = 'nodejs';

const bodySchema = z.object({ slug: z.string().max(64) }).strict();

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  try {
    const { siteId } = await params;
    const session = await requireSession(request, 'platform');
    const access = await requireSiteOwner(session, siteId);
    assertRecentlyAuthenticated(session);

    const body = bodySchema.parse(await request.json().catch(() => null));
    await enforceRateLimit('site:slug-change', `site:${siteId}`);

    const result = await changeSiteSlug({
      site: access.site,
      slug: body.slug,
      actorUserId: session.user._id,
      actorRole: access.role,
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
    });

    return ok({ ...result, storeUrl: siteOrigin({ slug: result.slug, name: access.site.name }) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

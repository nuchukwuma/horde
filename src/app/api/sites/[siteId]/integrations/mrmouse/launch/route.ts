/**
 * POST /api/sites/:siteId/integrations/mrmouse/launch → { url }
 *
 * Mints a 60-second signed sign-in pass for MrMouse's web app. POST, not a
 * link: a pass is only ever made because the signed-in person pressed the
 * button, never by a page that merely loaded an image or iframe.
 */

import type { NextRequest } from 'next/server';
import { requireSession, requestIp, requestUserAgent } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { assertPermission, requireSiteAccess } from '@/lib/auth/guards';
import { enforceRateLimit } from '@/lib/ratelimit';
import { issueMrMouseLaunch } from '@/lib/integrations/mrmouseService';
import { Membership } from '@/lib/db/models/Membership';
import { ForbiddenError } from '@/lib/errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  try {
    const { siteId } = await params;
    const session = await requireSession(request, 'platform');
    const access = await requireSiteAccess(session, siteId, ['owner', 'staff']);
    assertPermission(access, 'products:read');
    await enforceRateLimit('integration:launch', `user:${String(session.user._id)}`);

    // The pass vouches for this person *as a member of this store*. A platform
    // admin passes requireSiteAccess for every store, but must not be able to
    // open MrMouse as a store they do not belong to.
    const membership = await Membership.findOne({ userId: session.user._id, siteId: access.site._id }).lean();
    if (!membership) {
      throw new ForbiddenError('Launch by non-member', 'Only the store’s own team can open its MrMouse.');
    }

    const result = await issueMrMouseLaunch(session, access.site, membership.role, {
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
    });
    return ok(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * POST /api/admin/sites/:siteId/moderation — suspend, reinstate, flag or
 * unflag a store. Platform admins only; every call is audited with its reason.
 */

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession, requestIp, requestUserAgent } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { assertPlatformAdmin } from '@/lib/auth/guards';
import { moderateSite } from '@/lib/admin/moderation';

export const runtime = 'nodejs';

const moderationSchema = z.object({
  action: z.enum(['suspend', 'reinstate', 'flag', 'unflag']),
  reason: z.string().trim().min(3, 'Give a reason').max(500),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  try {
    const { siteId } = await params;
    const session = await requireSession(request, 'platform');
    assertPlatformAdmin(session);

    const { action, reason } = moderationSchema.parse(await request.json());
    const result = await moderateSite({
      siteId,
      action,
      reason,
      actorUserId: session.user._id,
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
    });
    return ok(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}

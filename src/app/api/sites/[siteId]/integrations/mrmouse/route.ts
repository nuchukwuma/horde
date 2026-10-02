/**
 * PATCH /api/sites/:siteId/integrations/mrmouse
 *   { connect: true }   the owner agrees to share store details with MrMouse
 *   { connect: false }  disconnect (also stops stock sync)
 *   { stockSync: bool } MrMouse becomes / stops being the source of stock levels
 *
 * The store's real owner only — sharing the store's data with another
 * service is theirs to decide, not staff's and not a platform admin's.
 */

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession, requestIp, requestUserAgent } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { requireOwnerMembership } from '@/lib/auth/guards';
import { changeMrMouseConnection } from '@/lib/integrations/mrmouseService';

export const runtime = 'nodejs';

const changeSchema = z
  .object({ connect: z.boolean().optional(), stockSync: z.boolean().optional() })
  .refine((body) => body.connect !== undefined || body.stockSync !== undefined, 'Nothing to change');

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  try {
    const { siteId } = await params;
    const session = await requireSession(request, 'platform');
    await requireOwnerMembership(session, siteId);
    const change = changeSchema.parse(await request.json());
    const state = await changeMrMouseConnection(siteId, change, {
      userId: session.user._id,
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
    });
    return ok(state);
  } catch (error) {
    return toErrorResponse(error);
  }
}

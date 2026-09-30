/**
 * Seller's inbox. Dashboard host, platform session, membership-checked.
 */

import type { NextRequest } from 'next/server';
import { requireSession } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { requireSiteAccess } from '@/lib/auth/guards';
import { listConversations } from '@/lib/chat/conversations';
import { parseLimit } from '@/lib/http/query';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  try {
    const { siteId } = await params;
    const session = await requireSession(request, 'platform');
    const access = await requireSiteAccess(session, siteId, ['owner', 'staff']);

    const limit = parseLimit(request.nextUrl.searchParams, 50, 200);
    const conversations = await listConversations({ siteId: access.site._id, limit });

    return ok(conversations);
  } catch (error) {
    return toErrorResponse(error);
  }
}

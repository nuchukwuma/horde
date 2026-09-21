/**
 * GET /api/admin/sellers — volume per seller, biggest first.
 */

import type { NextRequest } from 'next/server';
import { requireSession } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { assertPlatformAdmin } from '@/lib/auth/guards';
import { sellerVolume } from '@/lib/dashboard/admin';
import { parseDateRange, parseLimit } from '@/lib/http/query';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request, 'platform');
    assertPlatformAdmin(session);

    const search = request.nextUrl.searchParams;
    const rows = await sellerVolume({
      ...parseDateRange(search),
      limit: parseLimit(search, 50, 200),
    });

    return ok(rows);
  } catch (error) {
    return toErrorResponse(error);
  }
}

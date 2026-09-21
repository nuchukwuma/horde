/**
 * GET /api/admin/flagged — things a human should look at, worst first.
 */

import type { NextRequest } from 'next/server';
import { requireSession } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { assertPlatformAdmin } from '@/lib/auth/guards';
import { flaggedTransactions } from '@/lib/dashboard/admin';
import { parseLimit } from '@/lib/http/query';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request, 'platform');
    assertPlatformAdmin(session);

    const search = request.nextUrl.searchParams;
    const stuckPendingMinutes = Number(search.get('stuckPendingMinutes'));

    const items = await flaggedTransactions({
      limit: parseLimit(search, 100, 500),
      stuckPendingMinutes: Number.isFinite(stuckPendingMinutes) && stuckPendingMinutes > 0
        ? stuckPendingMinutes
        : undefined,
    });

    return ok(items);
  } catch (error) {
    return toErrorResponse(error);
  }
}

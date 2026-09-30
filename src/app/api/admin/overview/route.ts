/**
 * GET /api/admin/overview — platform revenue and health.
 *
 * Platform admin only. Everything below reads across tenants.
 */

import type { NextRequest } from 'next/server';
import { requireSession } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { assertPlatformAdmin } from '@/lib/auth/guards';
import { adminOverview } from '@/lib/dashboard/admin';
import { parseDateRange } from '@/lib/http/query';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request, 'platform');
    assertPlatformAdmin(session);

    const overview = await adminOverview(parseDateRange(request.nextUrl.searchParams));

    return ok(overview);
  } catch (error) {
    return toErrorResponse(error);
  }
}

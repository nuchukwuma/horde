/**
 * POST /api/auth/logout — revokes the session server-side, not just the cookie.
 *
 * Clearing the cookie alone would leave a live session row that a stolen token
 * could still use.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { ensureDatabase } from '@/lib/http/context';
import { toErrorResponse } from '@/lib/http/respond';
import { revokeSession } from '@/lib/auth/session';
import { clearedCookieOptions, sessionCookieName } from '@/lib/auth/cookies';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    await ensureDatabase();

    const cookieName = sessionCookieName('platform');
    const token = request.cookies.get(cookieName)?.value;
    if (token) await revokeSession(token);

    const response = NextResponse.json({ data: { ok: true } });
    response.cookies.set(cookieName, '', clearedCookieOptions('platform'));
    return response;
  } catch (error) {
    return toErrorResponse(error);
  }
}

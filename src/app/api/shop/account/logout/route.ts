/**
 * POST /api/shop/account/logout — revokes the storefront session server-side.
 *
 * Same reasoning as the seller logout: clearing the cookie without revoking
 * the row leaves a stolen token working.
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

    const cookieName = sessionCookieName('storefront');
    const token = request.cookies.get(cookieName)?.value;
    if (token) await revokeSession(token);

    const response = NextResponse.json({ data: { ok: true } });
    response.cookies.set(cookieName, '', clearedCookieOptions('storefront'));
    return response;
  } catch (error) {
    return toErrorResponse(error);
  }
}

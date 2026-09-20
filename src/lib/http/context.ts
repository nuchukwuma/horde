/**
 * Request context for route handlers: database connection and session.
 */

import type { NextRequest } from 'next/server';
import { connectToDatabase } from '../db/connect';
import { sessionCookieName } from '../auth/cookies';
import {
  assertAuthenticated,
  validateSessionToken,
  type AuthenticatedSession,
} from '../auth/session';
import type { SessionScope } from '../db/models/Session';

/** Idempotent; the connection is cached per process. */
export async function ensureDatabase(): Promise<void> {
  await connectToDatabase();
}

/**
 * Resolve the caller's session, or throw.
 *
 * The scope comes from the route, not from the token. A storefront session is
 * not accepted on a dashboard route even though the row is perfectly valid.
 */
export async function requireSession(
  request: NextRequest,
  scope: SessionScope = 'platform',
): Promise<AuthenticatedSession> {
  await ensureDatabase();

  const token = request.cookies.get(sessionCookieName(scope))?.value;
  const session = await validateSessionToken(token, scope);

  assertAuthenticated(session);
  return session;
}

export function requestIp(request: NextRequest): string | undefined {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim();
  return request.headers.get('x-real-ip') ?? undefined;
}

export function requestUserAgent(request: NextRequest): string | undefined {
  return request.headers.get('user-agent') ?? undefined;
}

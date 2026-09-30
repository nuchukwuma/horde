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
import type { SiteDocument } from '../db/models/Site';
import { findSiteBySlug, TENANT_SLUG_HEADER } from '../tenant/loadSite';
import { NotFoundError } from '../errors';

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

/**
 * Resolve the tenant for a PUBLIC request from the host header.
 *
 * The header is set by middleware from the Host and any client-supplied copy is
 * stripped there first, so it cannot be forged. Suspended and closed sites
 * resolve to a 404: a suspended storefront should look absent to the public,
 * not broken.
 */
export async function requirePublicSite(request: NextRequest): Promise<SiteDocument> {
  await ensureDatabase();

  const slug = request.headers.get(TENANT_SLUG_HEADER);
  if (!slug) throw new NotFoundError('Store');

  const site = await findSiteBySlug(slug);
  if (!site || site.status !== 'active') throw new NotFoundError('Store');

  return site;
}

export function requestIp(request: NextRequest): string | undefined {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim();
  return request.headers.get('x-real-ip') ?? undefined;
}

export function requestUserAgent(request: NextRequest): string | undefined {
  return request.headers.get('user-agent') ?? undefined;
}

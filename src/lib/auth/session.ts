/**
 * Session issuance and validation.
 *
 * The raw token exists only in the cookie. The database stores a SHA-256 digest,
 * so a leaked dump yields no usable sessions. SHA-256 (not argon2) is correct
 * here: the token is 256 bits of CSPRNG output, so there is no low-entropy
 * guess space for a slow hash to defend.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Types } from 'mongoose';
import { Session, type SessionScope } from '../db/models/Session';
import { User, type UserAttributes } from '../db/models/User';
import { AuthenticationError, StepUpRequiredError } from '../errors';

export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

/**
 * How recently the password must have been confirmed before a sensitive action
 * (changing payout bank details) is allowed. Short by design.
 */
export const STEP_UP_MAX_AGE_MS = 1000 * 60 * 10; // 10 minutes

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function constantTimeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export interface CreateSessionInput {
  userId: Types.ObjectId;
  scope: SessionScope;
  siteId?: Types.ObjectId | null;
  ip?: string;
  userAgent?: string;
}

export async function createSession(input: CreateSessionInput): Promise<{ token: string }> {
  const token = generateSessionToken();

  await Session.create({
    tokenHash: hashSessionToken(token),
    userId: input.userId,
    scope: input.scope,
    siteId: input.siteId ?? null,
    reauthenticatedAt: new Date(),
    ip: input.ip,
    userAgent: input.userAgent,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });

  return { token };
}

export interface AuthenticatedSession {
  sessionId: Types.ObjectId;
  user: UserAttributes;
  scope: SessionScope;
  siteId?: Types.ObjectId | null;
  reauthenticatedAt: Date;
}

/**
 * Resolve a cookie token to a live session.
 *
 * `expectedScope` must be supplied by the caller from the host it is serving,
 * never read from the token. A storefront session presented to the dashboard is
 * rejected even though the row is valid.
 */
export async function validateSessionToken(
  token: string | undefined | null,
  expectedScope: SessionScope,
): Promise<AuthenticatedSession | null> {
  if (!token) return null;

  const session = await Session.findOne({
    tokenHash: hashSessionToken(token),
    scope: expectedScope,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });

  if (!session) return null;

  const user = await User.findById(session.userId);
  if (!user || user.status !== 'active') return null;

  return {
    sessionId: session._id,
    user,
    scope: session.scope,
    siteId: session.siteId,
    reauthenticatedAt: session.reauthenticatedAt,
  };
}

export async function revokeSession(token: string): Promise<void> {
  await Session.updateOne(
    { tokenHash: hashSessionToken(token) },
    { $set: { revokedAt: new Date() } },
  );
}

/** Used on password change and on account suspension. */
export async function revokeAllSessionsForUser(userId: Types.ObjectId): Promise<number> {
  const result = await Session.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  return result.modifiedCount;
}

/** Refresh the step-up clock after a successful password re-confirmation. */
export async function markReauthenticated(sessionId: Types.ObjectId): Promise<void> {
  await Session.updateOne({ _id: sessionId }, { $set: { reauthenticatedAt: new Date() } });
}

export function assertAuthenticated(
  session: AuthenticatedSession | null,
): asserts session is AuthenticatedSession {
  if (!session) throw new AuthenticationError();
}

/**
 * Gate for sensitive actions. Session age is not enough — a long-lived session on
 * an unattended laptop should not be able to redirect a seller's payouts.
 */
export function assertRecentlyAuthenticated(
  session: AuthenticatedSession,
  maxAgeMs = STEP_UP_MAX_AGE_MS,
): void {
  const age = Date.now() - session.reauthenticatedAt.getTime();
  if (age > maxAgeMs) {
    throw new StepUpRequiredError(
      'Please confirm your password again to change payout details',
    );
  }
}

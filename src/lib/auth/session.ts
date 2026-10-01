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
import { Customer, type CustomerAttributes } from '../db/models/Customer';
import { runWithTenant } from '../tenant/context';
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
  /** Platform only. Shoppers get a storefront session via createCustomerSession. */
  scope: 'platform';
  ip?: string;
  userAgent?: string;
}

export async function createSession(input: CreateSessionInput): Promise<{ token: string }> {
  const token = generateSessionToken();

  await Session.create({
    tokenHash: hashSessionToken(token),
    userId: input.userId,
    scope: input.scope,
    siteId: null,
    reauthenticatedAt: new Date(),
    ip: input.ip,
    userAgent: input.userAgent,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });

  return { token };
}

export interface CreateCustomerSessionInput {
  customerId: Types.ObjectId;
  /** The store this session is valid on. Never omitted — it is the whole point. */
  siteId: Types.ObjectId;
  ip?: string;
  userAgent?: string;
}

/**
 * Issue a storefront session for a shopper.
 *
 * Separate from createSession because the subject lives in a different
 * collection and the session is bound to one site. Sharing one function would
 * mean a `scope` parameter deciding which id field to populate, and getting
 * that wrong writes a session that authorises the wrong kind of principal.
 */
export async function createCustomerSession(
  input: CreateCustomerSessionInput,
): Promise<{ token: string }> {
  const token = generateSessionToken();

  await Session.create({
    tokenHash: hashSessionToken(token),
    customerId: input.customerId,
    scope: 'storefront',
    siteId: input.siteId,
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

  if (!session || !session.userId) return null;

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

export interface AuthenticatedCustomer {
  sessionId: Types.ObjectId;
  customer: CustomerAttributes;
  siteId: Types.ObjectId;
}

/**
 * Resolve a storefront cookie to a shopper on a SPECIFIC store.
 *
 * `siteId` is supplied by the caller from the resolved host, and the session
 * row must match it. Without that check a session issued on one storefront
 * would authenticate its holder on every other storefront, since they all
 * share the same application and differ only by hostname.
 */
export async function validateCustomerSessionToken(
  token: string | undefined | null,
  siteId: Types.ObjectId,
): Promise<AuthenticatedCustomer | null> {
  if (!token) return null;

  const session = await Session.findOne({
    tokenHash: hashSessionToken(token),
    scope: 'storefront',
    siteId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });

  if (!session?.customerId || !session.siteId) return null;

  // Read through the tenant scope so a customer row from another store cannot
  // be reached even if a session somehow pointed at one.
  const customer = await runWithTenant({ siteId: String(session.siteId) }, () =>
    Customer.findById(session.customerId),
  );

  if (!customer || customer.status !== 'active') return null;

  return { sessionId: session._id, customer, siteId: session.siteId };
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
      'Please confirm your password again to continue',
    );
  }
}

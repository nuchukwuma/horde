/**
 * Password hashing, cookie scoping, and step-up re-authentication.
 *
 * The cookie tests look trivial and are not: a Domain attribute on the dashboard
 * cookie would hand every seller subdomain a copy of the platform session, which
 * is the single worst failure available in this architecture.
 */

import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { hashPassword, verifyPassword, fakeVerifyPassword } from '../../src/lib/auth/password';
import {
  STEP_UP_MAX_AGE_MS,
  assertAuthenticated,
  assertRecentlyAuthenticated,
  generateSessionToken,
  hashSessionToken,
  type AuthenticatedSession,
} from '../../src/lib/auth/session';
import {
  PLATFORM_SESSION_COOKIE,
  STOREFRONT_SESSION_COOKIE,
  clearedCookieOptions,
  sessionCookieName,
  sessionCookieOptions,
} from '../../src/lib/auth/cookies';
import { AuthenticationError, StepUpRequiredError } from '../../src/lib/errors';

describe('password hashing', () => {
  it('verifies a correct password', async () => {
    const hash = await hashPassword('correct-horse-battery');
    expect(await verifyPassword(hash, 'correct-horse-battery')).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('correct-horse-battery');
    expect(await verifyPassword(hash, 'wrong-password-here')).toBe(false);
  });

  it('salts, so the same password hashes differently each time', async () => {
    const a = await hashPassword('correct-horse-battery');
    const b = await hashPassword('correct-horse-battery');
    expect(a).not.toBe(b);
  });

  it('produces an argon2id hash', async () => {
    expect(await hashPassword('correct-horse-battery')).toMatch(/^\$argon2id\$/);
  });

  it('refuses a short password', async () => {
    await expect(hashPassword('short')).rejects.toThrow(/at least 12/);
  });

  it('refuses an unbounded password, which is a cheap CPU burn on login', async () => {
    await expect(hashPassword('a'.repeat(5_000))).rejects.toThrow(/at most/);
  });

  it('returns false rather than throwing on a malformed stored hash', async () => {
    expect(await verifyPassword('not-a-hash', 'anything')).toBe(false);
    expect(await verifyPassword('', 'anything')).toBe(false);
  });

  it('provides a decoy verification for unknown accounts', async () => {
    // Exists so that a login for a non-existent email costs the same time as a
    // real one, and therefore does not confirm which addresses are registered.
    expect(await fakeVerifyPassword()).toBe(false);
  });
});

describe('session tokens', () => {
  it('generates distinct high-entropy tokens', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateSessionToken()));
    expect(tokens.size).toBe(200);
  });

  it('generates URL-safe tokens of at least 256 bits', () => {
    const token = generateSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(token, 'base64url').length).toBe(32);
  });

  it('hashes deterministically', () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
  });

  it('produces a hash that does not reveal the token', () => {
    const token = generateSessionToken();
    const hash = hashSessionToken(token);
    expect(hash).not.toBe(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('authentication assertions', () => {
  it('throws when there is no session', () => {
    expect(() => assertAuthenticated(null)).toThrow(AuthenticationError);
  });

  it('passes when there is one', () => {
    const session = { sessionId: new Types.ObjectId() } as AuthenticatedSession;
    expect(() => assertAuthenticated(session)).not.toThrow();
  });
});

describe('step-up re-authentication', () => {
  const base: AuthenticatedSession = {
    sessionId: new Types.ObjectId(),
    user: {} as never,
    scope: 'platform',
    siteId: null,
    reauthenticatedAt: new Date(),
  };

  it('allows a sensitive action just after authenticating', () => {
    expect(() => assertRecentlyAuthenticated(base)).not.toThrow();
  });

  it('blocks a sensitive action on a stale session', () => {
    const stale = {
      ...base,
      reauthenticatedAt: new Date(Date.now() - STEP_UP_MAX_AGE_MS - 1_000),
    };
    expect(() => assertRecentlyAuthenticated(stale)).toThrow(StepUpRequiredError);
  });

  it('blocks right after the window closes', () => {
    const edge = {
      ...base,
      reauthenticatedAt: new Date(Date.now() - STEP_UP_MAX_AGE_MS - 1),
    };
    expect(() => assertRecentlyAuthenticated(edge)).toThrow(StepUpRequiredError);
  });

  it('keeps the step-up window short', () => {
    expect(STEP_UP_MAX_AGE_MS).toBeLessThanOrEqual(15 * 60 * 1_000);
  });
});

describe('cookie scoping', () => {
  it('never sets a Domain attribute', () => {
    // A Domain of ".hordemart.com" would send the dashboard session to every
    // seller subdomain, where seller-controlled content could read it.
    for (const scope of ['platform', 'storefront'] as const) {
      expect(sessionCookieOptions(scope, true)).not.toHaveProperty('domain');
      expect(clearedCookieOptions(scope)).not.toHaveProperty('domain');
    }
  });

  it('uses the __Host- prefix for platform sessions', () => {
    expect(sessionCookieName('platform')).toBe(PLATFORM_SESSION_COOKIE);
    expect(PLATFORM_SESSION_COOKIE.startsWith('__Host-')).toBe(true);
  });

  it('satisfies what the __Host- prefix requires in production', () => {
    const options = sessionCookieOptions('platform', true);
    expect(options.secure).toBe(true);
    expect(options.path).toBe('/');
    expect(options.httpOnly).toBe(true);
  });

  it('is httpOnly in every scope, so script cannot read it', () => {
    expect(sessionCookieOptions('storefront', true).httpOnly).toBe(true);
  });

  it('relaxes Secure only outside production, where there is no TLS', () => {
    expect(sessionCookieOptions('platform', false).secure).toBe(false);
  });

  it('uses distinct names per scope', () => {
    expect(sessionCookieName('platform')).not.toBe(sessionCookieName('storefront'));
    expect(sessionCookieName('storefront')).toBe(STOREFRONT_SESSION_COOKIE);
  });

  it('uses Lax for storefronts so the Paystack redirect keeps the session', () => {
    expect(sessionCookieOptions('storefront', true).sameSite).toBe('lax');
  });

  it('uses Strict for the dashboard, which no third party redirects into', () => {
    expect(sessionCookieOptions('platform', true).sameSite).toBe('strict');
  });

  it('expires a cleared cookie immediately', () => {
    expect(clearedCookieOptions('platform').maxAge).toBe(0);
  });
});

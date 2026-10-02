/**
 * Signup: input rules, and the session invariant that keeps a shopper's
 * session from ever authenticating as a seller.
 *
 * These run without a database. The uniqueness guarantees (one email per
 * platform, one email per store) are indexes and belong to the integration
 * suite; what is checked here is everything that can be got wrong before a
 * write is attempted.
 */

import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import {
  customerSignInSchema,
  customerSignUpSchema,
  sellerSignUpSchema,
} from '../../src/lib/validation/schemas';
import { Session } from '../../src/lib/db/models/Session';
import { Customer } from '../../src/lib/db/models/Customer';

const validSeller = {
  email: 'ade@example.com',
  password: 'correct-horse-battery',
  name: 'Ade Okon',
  siteName: 'Ade Stores',
  slug: 'ade-store',
  acceptTerms: true,
};

describe('seller signup input', () => {
  it('refuses a shop without the terms accepted — ticked, not defaulted', () => {
    const { acceptTerms: _ignored, ...unticked } = validSeller;
    void _ignored;
    expect(sellerSignUpSchema.safeParse(unticked).success).toBe(false);
    expect(sellerSignUpSchema.safeParse({ ...validSeller, acceptTerms: false }).success).toBe(false);
  });

  it('accepts a well-formed submission', () => {
    expect(sellerSignUpSchema.safeParse(validSeller).success).toBe(true);
  });

  it('lowercases and trims the email so one address cannot register twice', () => {
    // Without normalisation "Ade@Example.com" and "ade@example.com" are two
    // accounts, and the unique index would not object.
    const result = sellerSignUpSchema.parse({ ...validSeller, email: '  Ade@Example.COM ' });
    expect(result.email).toBe('ade@example.com');
  });

  it('rejects a password under the minimum length', () => {
    const result = sellerSignUpSchema.safeParse({ ...validSeller, password: 'short' });
    expect(result.success).toBe(false);
  });

  it('refuses a reserved subdomain', () => {
    // admin.hordemart.com must never belong to a seller.
    for (const slug of ['admin', 'api', 'www', 'checkout']) {
      const result = sellerSignUpSchema.safeParse({ ...validSeller, slug });
      expect(result.success, `${slug} should be reserved`).toBe(false);
    }
  });

  it('refuses a bank or payment brand as a subdomain', () => {
    // gtbank.hordemart.com is a phishing page wearing our certificate.
    for (const slug of ['gtbank', 'paystack', 'opay', 'verify']) {
      const result = sellerSignUpSchema.safeParse({ ...validSeller, slug });
      expect(result.success, `${slug} should be reserved`).toBe(false);
    }
  });

  it('refuses a malformed subdomain', () => {
    for (const slug of ['ab', '-leading', 'trailing-', 'has space', 'UPPER!']) {
      const result = sellerSignUpSchema.safeParse({ ...validSeller, slug });
      expect(result.success, `${slug} should be invalid`).toBe(false);
    }
  });

  it('carries no money field', () => {
    // Nothing about a plan or a fee is client-supplied at signup; the plan is
    // assigned server-side. This asserts the shape rather than trusting it.
    const parsed = sellerSignUpSchema.parse(validSeller);
    expect(Object.keys(parsed).sort()).toEqual(
      ['acceptTerms', 'email', 'name', 'password', 'siteName', 'slug'].sort(),
    );
  });
});

describe('shopper signup input', () => {
  it('accepts a well-formed submission', () => {
    const result = customerSignUpSchema.safeParse({
      email: 'buyer@example.com',
      password: 'correct-horse-battery',
      name: 'Chidi Eze',
      acceptTerms: true,
    });
    expect(result.success).toBe(true);
  });

  it('refuses an account without the terms accepted', () => {
    const base = { email: 'buyer@example.com', password: 'correct-horse-battery', name: 'Chidi Eze' };
    expect(customerSignUpSchema.safeParse(base).success).toBe(false);
    expect(customerSignUpSchema.safeParse({ ...base, acceptTerms: false }).success).toBe(false);
    expect(customerSignUpSchema.safeParse({ ...base, acceptTerms: 'yes' }).success).toBe(false);
  });

  it('strips a client-supplied siteId rather than honouring it', () => {
    // The store is decided by the host header. A body naming a site is the
    // exact cross-tenant hole that header handling exists to close, so the
    // field must not survive parsing.
    const parsed = customerSignUpSchema.parse({
      email: 'buyer@example.com',
      password: 'correct-horse-battery',
      name: 'Chidi Eze',
      acceptTerms: true,
      siteId: '507f1f77bcf86cd799439011',
    } as Record<string, unknown>);

    expect('siteId' in parsed).toBe(false);
  });

  it('does not impose a length rule on the sign-in password', () => {
    // Raising the minimum later must not lock out accounts created under the
    // old rule; only registration enforces length.
    expect(
      customerSignInSchema.safeParse({ email: 'buyer@example.com', password: 'old' }).success,
    ).toBe(true);
  });
});

describe('session subject invariant', () => {
  const userId = new Types.ObjectId();
  const customerId = new Types.ObjectId();
  const siteId = new Types.ObjectId();

  function session(overrides: Record<string, unknown>) {
    return new Session({
      tokenHash: 'a'.repeat(64),
      reauthenticatedAt: new Date(),
      expiresAt: new Date(Date.now() + 1000),
      ...overrides,
    });
  }

  it('accepts a platform session with a user', async () => {
    await expect(session({ scope: 'platform', userId }).validate()).resolves.toBeUndefined();
  });

  it('accepts a storefront session with a customer and a site', async () => {
    await expect(
      session({ scope: 'storefront', customerId, siteId }).validate(),
    ).resolves.toBeUndefined();
  });

  it('refuses a storefront session carrying a userId', async () => {
    // This is the dangerous shape: a shopper's cookie resolving to a seller
    // account. Refused at write time rather than guarded at every read.
    await expect(
      session({ scope: 'storefront', customerId, siteId, userId }).validate(),
    ).rejects.toThrow(/must not carry a userId/);
  });

  it('refuses a platform session carrying a customerId', async () => {
    await expect(
      session({ scope: 'platform', userId, customerId }).validate(),
    ).rejects.toThrow(/must not carry a customerId/);
  });

  it('refuses a session with no subject at all', async () => {
    await expect(session({ scope: 'platform' }).validate()).rejects.toThrow(/requires a userId/);
    await expect(session({ scope: 'storefront' }).validate()).rejects.toThrow(
      /requires a customerId/,
    );
  });

  it('refuses a storefront session with no site', async () => {
    // A storefront session not bound to a store would authenticate its holder
    // on every store.
    await expect(
      session({ scope: 'storefront', customerId }).validate(),
    ).rejects.toThrow(/requires a siteId/);
  });
});

describe('customer serialisation', () => {
  it('never carries the password hash into a response', () => {
    const customer = new Customer({
      siteId: new Types.ObjectId(),
      email: 'buyer@example.com',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$abc',
      name: 'Chidi Eze',
    });

    expect(JSON.stringify(customer)).not.toContain('argon2id');
  });
});

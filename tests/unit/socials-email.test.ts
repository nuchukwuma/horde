/**
 * Social links and email verification.
 *
 * The socials tests are the security-relevant half. Handles are stored and
 * URLs are built, so the thing worth proving is that nothing a seller types
 * can become a host, a scheme, or a look-alike domain in an href.
 */

import { describe, expect, it } from 'vitest';
import { buildSocialLinks, socialsSchema } from '../../src/lib/content/socials';
import {
  assertEmailConfigured,
  emailFrom,
  emailTransport,
} from '../../src/lib/email/transport';
import {
  assertEmailVerified,
  hashVerificationToken,
  isEmailVerified,
  generateVerificationToken,
} from '../../src/lib/auth/emailVerification';
import { assertRefundMechanicsConfirmed } from '../../src/lib/payments/refundPolicy';

describe('social handles', () => {
  it('accepts a bare handle', () => {
    const result = socialsSchema.safeParse({ instagram: 'adestores' });
    expect(result.success).toBe(true);
  });

  it('strips a pasted profile URL down to the handle', () => {
    // The commonest input mistake. Rejecting it would be correct and annoying.
    const parsed = socialsSchema.parse({ instagram: 'https://www.instagram.com/adestores' });
    expect(parsed.instagram).toBe('adestores');
  });

  it('strips a leading @', () => {
    expect(socialsSchema.parse({ x: '@adestores' }).x).toBe('adestores');
  });

  it('refuses a handle containing a scheme or a slash', () => {
    for (const value of ['javascript:alert(1)', 'a/../b', 'host.com/path', 'a b']) {
      expect(
        socialsSchema.safeParse({ instagram: value }).success,
        `${value} should be refused`,
      ).toBe(false);
    }
  });

  it('normalises a WhatsApp number to digits', () => {
    expect(socialsSchema.parse({ whatsapp: '+234 801 234 5678' }).whatsapp).toBe('2348012345678');
  });

  it('refuses a WhatsApp value that is not a number', () => {
    expect(socialsSchema.safeParse({ whatsapp: 'callme' }).success).toBe(false);
  });

  it('refuses an unknown platform rather than storing it', () => {
    // .strict() — an unknown key would otherwise be persisted and then handed
    // to buildSocialLinks, which is not expecting it.
    expect(socialsSchema.safeParse({ myspace: 'adestores' }).success).toBe(false);
  });
});

describe('website link', () => {
  it('accepts an https address', () => {
    expect(socialsSchema.safeParse({ website: 'https://adestores.ng' }).success).toBe(true);
  });

  it('refuses every scheme but https', () => {
    for (const value of [
      'http://adestores.ng',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
    ]) {
      expect(
        socialsSchema.safeParse({ website: value }).success,
        `${value} should be refused`,
      ).toBe(false);
    }
  });

  it('refuses userinfo, which makes a look-alike host', () => {
    // https://instagram.com@evil.com parses with host evil.com. A visitor
    // reading the link sees instagram.com.
    expect(socialsSchema.safeParse({ website: 'https://instagram.com@evil.com' }).success).toBe(
      false,
    );
  });
});

describe('buildSocialLinks', () => {
  it('builds hrefs on hosts we chose, not hosts the seller supplied', () => {
    const links = buildSocialLinks({ instagram: 'adestores', whatsapp: '2348012345678' });

    const instagram = links.find((link) => link.platform === 'instagram');
    expect(instagram?.href).toBe('https://instagram.com/adestores');
    expect(instagram?.text).toBe('@adestores');

    const whatsapp = links.find((link) => link.platform === 'whatsapp');
    expect(whatsapp?.href).toBe('https://wa.me/2348012345678');
  });

  it('drops a stored value that would not pass validation today', () => {
    // A row written before a rule tightened, or edited by hand, must not reach
    // an href. The renderer re-checks rather than trusting the database.
    const links = buildSocialLinks({
      instagram: 'javascript:alert(1)',
      website: 'http://insecure.example',
    } as Record<string, string>);

    expect(links).toEqual([]);
  });

  it('returns nothing for an empty or absent object', () => {
    expect(buildSocialLinks(null)).toEqual([]);
    expect(buildSocialLinks({})).toEqual([]);
  });

  it('shows a website by hostname rather than the full URL', () => {
    const links = buildSocialLinks({ website: 'https://www.adestores.ng/shop?x=1' });
    expect(links[0]?.text).toBe('adestores.ng');
  });
});

describe('email transport selection', () => {
  it('uses the log transport when no key is configured', () => {
    expect(emailTransport({})).toBe('log');
  });

  it('uses resend when a key is present', () => {
    expect(emailTransport({ RESEND_API_KEY: 're_abc' })).toBe('resend');
  });

  it('refuses to pretend in production without a key', () => {
    // A deploy missing the key would otherwise print verification links into
    // the server log and tell every new seller to check their inbox.
    expect(() => assertEmailConfigured({ NODE_ENV: 'production' })).toThrow(/RESEND_API_KEY/);
  });

  it('allows the log transport outside production', () => {
    expect(() => assertEmailConfigured({ NODE_ENV: 'development' })).not.toThrow();
  });

  it('reads the sender from configuration', () => {
    expect(emailFrom({ EMAIL_FROM: 'HordeMart <hi@hordemart.com>' })).toBe(
      'HordeMart <hi@hordemart.com>',
    );
  });
});

describe('verification tokens', () => {
  it('hashes deterministically and does not store the token', () => {
    const token = generateVerificationToken();
    expect(hashVerificationToken(token)).toBe(hashVerificationToken(token));
    expect(hashVerificationToken(token)).not.toContain(token);
    expect(hashVerificationToken(token)).toHaveLength(64);
  });

  it('generates a token with enough entropy to be unguessable', () => {
    const a = generateVerificationToken();
    const b = generateVerificationToken();
    expect(a).not.toBe(b);
    // 32 bytes base64url.
    expect(a.length).toBeGreaterThanOrEqual(43);
  });
});

describe('the payout email gate', () => {
  it('treats a null verification date as unverified', () => {
    expect(isEmailVerified({ emailVerifiedAt: null })).toBe(false);
    expect(isEmailVerified({ emailVerifiedAt: undefined })).toBe(false);
  });

  it('throws rather than returning false, so a forgotten if cannot grant access', () => {
    expect(() => assertEmailVerified({ emailVerifiedAt: null })).toThrow(/Confirm your email/);
  });

  it('passes a verified user', () => {
    expect(() => assertEmailVerified({ emailVerifiedAt: new Date() })).not.toThrow();
  });
});

describe('the ADR-0009 refund gate', () => {
  it('blocks production refunds until the Paystack answer is recorded', () => {
    expect(() => assertRefundMechanicsConfirmed({ NODE_ENV: 'production' })).toThrow(
      /unconfirmed/,
    );
  });

  it('allows them once confirmed', () => {
    expect(() =>
      assertRefundMechanicsConfirmed({
        NODE_ENV: 'production',
        PAYSTACK_REFUND_MECHANICS_CONFIRMED: 'true',
      }),
    ).not.toThrow();
  });

  it('never blocks development, which is where this code gets exercised', () => {
    expect(() => assertRefundMechanicsConfirmed({ NODE_ENV: 'development' })).not.toThrow();
  });
});

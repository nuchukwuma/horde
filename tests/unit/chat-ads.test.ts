/**
 * Chat payment-risk detection, and the per-host CSP that keeps ad scripts off
 * storefronts.
 *
 * The CSP tests are the ones to keep: they assert the resolution of a real
 * conflict — AdSense needs 'unsafe-inline', seller HTML must never run inline
 * script — and a well-meant future edit to "just allow ads everywhere" should
 * turn them red.
 */

import { describe, expect, it } from 'vitest';
import { assessPaymentRisk, SELLER_REVIEW_THRESHOLD } from '../../src/lib/chat/paymentRisk';
import { adsenseClient, buildCsp, isPlatformHost } from '../../src/lib/security/csp';

describe('off-platform payment detection', () => {
  it('flags a bare NUBAN', () => {
    const result = assessPaymentRisk('Send it to 0123456789 and I will ship today');
    expect(result.flagged).toBe(true);
    expect(result.signals).toContain('account_number');
    expect(result.warning).toMatch(/no way for us to help you/);
  });

  it('flags a bank name', () => {
    expect(assessPaymentRisk('My GTBank is faster').signals).toContain('bank_name');
    expect(assessPaymentRisk('use opay instead').signals).toContain('bank_name');
  });

  it('flags the direct request even with no number in sight', () => {
    for (const text of [
      'just pay me directly',
      'can you do a bank transfer',
      'whatsapp me and we sort it out',
      'cheaper if you skip the checkout',
    ]) {
      expect(assessPaymentRisk(text).flagged, text).toBe(true);
    }
  });

  it('flags a number spelled out, which is the second attempt', () => {
    const result = assessPaymentRisk('zero eight one two three four five six seven eight');
    expect(result.signals).toContain('spelled_out_number');
  });

  it('flags a number broken up to defeat a digit match', () => {
    expect(assessPaymentRisk('0 8 0 1 2 3 4 5 6 7').signals).toContain('spaced_out_number');
    expect(assessPaymentRisk('0801-234-5678').signals).toContain('spaced_out_number');
  });

  it('flags crypto and gift cards', () => {
    expect(assessPaymentRisk('send usdt trc20').signals).toContain('irreversible_payment');
    expect(assessPaymentRisk('do you take a steam card').signals).toContain(
      'irreversible_payment',
    );
  });

  it('leaves ordinary shop talk alone', () => {
    for (const text of [
      'Do you have this in size 42?',
      'When will my order arrive?',
      'The blue one please, thanks!',
      'I paid already, reference HM-ABC',
      'Can I get 2 of them?',
    ]) {
      expect(assessPaymentRisk(text).flagged, text).toBe(false);
    }
  });

  it('returns no warning when nothing fired', () => {
    expect(assessPaymentRisk('Is this still available?').warning).toBeNull();
  });

  it('flags a seller warning a customer off a scam, which is why it never blocks', () => {
    // The honest false positive. A seller saying the right thing trips the
    // same signals as one saying the wrong thing, and this is the case that
    // makes blocking the wrong response — see the module comment.
    const result = assessPaymentRisk(
      'We never take bank transfer. Please use the checkout button only.',
    );
    expect(result.flagged).toBe(true);
  });

  it('needs more than one flag before a human looks', () => {
    // One flag is usually the message above. A pattern is different.
    expect(SELLER_REVIEW_THRESHOLD).toBeGreaterThan(1);
  });
});

describe('CSP by host', () => {
  const prod = { isDev: false, adsEnabled: true };

  it('never allows inline script on a tenant storefront', () => {
    // The load-bearing assertion. Seller HTML renders on tenant hosts and
    // sanitizeRichText assumes inline execution is off.
    const csp = buildCsp({ ...prod, hostKind: 'tenant' });
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("'unsafe-inline'; script");
    const scriptSrc = csp.split('; ').find((part) => part.startsWith('script-src'));
    expect(scriptSrc).toBe("script-src 'self'");
  });

  it('never allows ad hosts on a tenant storefront', () => {
    const csp = buildCsp({ ...prod, hostKind: 'tenant' });
    expect(csp).not.toContain('googlesyndication');
    expect(csp).not.toContain('doubleclick');
  });

  it('treats a seller custom domain exactly like a subdomain', () => {
    const csp = buildCsp({ ...prod, hostKind: 'custom-domain' });
    expect(csp.split('; ').find((part) => part.startsWith('script-src'))).toBe(
      "script-src 'self'",
    );
  });

  it('allows ad hosts on the platform apex and app host', () => {
    for (const hostKind of ['apex', 'app'] as const) {
      const csp = buildCsp({ ...prod, hostKind });
      expect(csp, hostKind).toContain('https://pagead2.googlesyndication.com');
      expect(csp, hostKind).toContain("'unsafe-inline'");
    }
  });

  it('allows no ad hosts anywhere when ads are not configured', () => {
    const csp = buildCsp({ isDev: false, adsEnabled: false, hostKind: 'apex' });
    expect(csp).not.toContain('googlesyndication');
    expect(csp.split('; ').find((part) => part.startsWith('script-src'))).toBe(
      "script-src 'self'",
    );
  });

  it('relaxes script-src in development for the dev server, on every host', () => {
    const csp = buildCsp({ isDev: true, adsEnabled: false, hostKind: 'tenant' });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain('ws:');
  });

  it('keeps production strict on a tenant host even with ads on', () => {
    // Guards against a dev-only relaxation leaking into production.
    const csp = buildCsp({ isDev: false, adsEnabled: true, hostKind: 'tenant' });
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it('always forbids objects and framing', () => {
    for (const hostKind of ['apex', 'app', 'tenant', 'custom-domain'] as const) {
      const csp = buildCsp({ ...prod, hostKind });
      expect(csp, hostKind).toContain("object-src 'none'");
      expect(csp, hostKind).toContain("frame-ancestors 'none'");
    }
  });

  it('names only the platform hosts as platform hosts', () => {
    expect(isPlatformHost('apex')).toBe(true);
    expect(isPlatformHost('app')).toBe(true);
    expect(isPlatformHost('tenant')).toBe(false);
    expect(isPlatformHost('custom-domain')).toBe(false);
    expect(isPlatformHost('invalid')).toBe(false);
  });
});

describe('adsense configuration', () => {
  it('is off when unset', () => {
    expect(adsenseClient({})).toBeNull();
  });

  it('rejects a malformed publisher id rather than emitting a broken tag', () => {
    for (const value of ['pub-123', 'ca-pub-abc', 'ca-pub-12', '']) {
      expect(adsenseClient({ NEXT_PUBLIC_ADSENSE_CLIENT: value }), value).toBeNull();
    }
  });

  it('accepts a well-formed publisher id', () => {
    expect(adsenseClient({ NEXT_PUBLIC_ADSENSE_CLIENT: 'ca-pub-1234567890123456' })).toBe(
      'ca-pub-1234567890123456',
    );
  });
});

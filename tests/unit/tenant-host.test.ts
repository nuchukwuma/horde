/**
 * AC-003: reserved subdomains are refused, and host parsing cannot be tricked
 * into treating a nested or lookalike host as a tenant.
 *
 * The financial-brand cases are not hypothetical. A storefront at
 * gtbank.<root> serves a bank-branded page over our own TLS certificate.
 */

import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { isReservedSlug, validateSlug } from '../../src/lib/tenant/reserved';
import { resolveHost, normalizeHostname } from '../../src/lib/tenant/resolveHost';
import { Site } from '../../src/lib/db/models/Site';
import { createSiteSchema } from '../../src/lib/validation/schemas';

const config = { rootDomain: 'hordemart.com', appHost: 'app.hordemart.com' };

describe('AC-003 — infrastructure names are reserved', () => {
  const reserved = ['www', 'api', 'admin', 'app', 'mail', 'cdn', 'status', 'webhooks', 'staging'];

  it.each(reserved)('rejects "%s"', (slug) => {
    expect(isReservedSlug(slug)).toBe(true);
    expect(validateSlug(slug).valid).toBe(false);
  });
});

describe('AC-003 — financial brands are reserved', () => {
  const brands = ['paystack', 'gtbank', 'opay', 'kuda', 'moniepoint', 'cbn', 'flutterwave'];

  it.each(brands)('rejects "%s"', (slug) => {
    expect(isReservedSlug(slug)).toBe(true);
  });

  it('rejects decorated variants', () => {
    for (const slug of ['gtbank-ng', 'secure-paystack', 'opay2', 'verify-bvn', 'kuda-official']) {
      expect(isReservedSlug(slug)).toBe(true);
    }
  });

  it('does not over-match names that merely contain a brand as a substring', () => {
    // These are legitimate business names and must stay available.
    for (const slug of ['urbanwear', 'bankole-designs', 'accessories-ng']) {
      expect(isReservedSlug(slug)).toBe(false);
    }
  });
});

describe('slug shape rules', () => {
  it('accepts ordinary names', () => {
    for (const slug of ['ade-store', 'chioma1', 'lagos-prints', 'abc']) {
      expect(validateSlug(slug).valid).toBe(true);
    }
  });

  it('rejects too short and too long', () => {
    expect(validateSlug('ab').reason).toBe('too_short');
    expect(validateSlug('a'.repeat(31)).reason).toBe('too_long');
  });

  it('rejects leading and trailing hyphens', () => {
    expect(validateSlug('-store').reason).toBe('invalid_characters');
    expect(validateSlug('store-').reason).toBe('invalid_characters');
  });

  it('rejects underscores and uppercase-only-invalid characters', () => {
    expect(validateSlug('My_Store').reason).toBe('invalid_characters');
    expect(validateSlug('my store').reason).toBe('invalid_characters');
  });

  it('normalises case before validating', () => {
    expect(validateSlug('Ade-Store').valid).toBe(true);
  });

  it('rejects punycode, which enables homograph lookalikes', () => {
    expect(validateSlug('xn--80ak6aa92e').reason).toBe('punycode_not_allowed');
  });

  it('rejects doubled hyphens that read as one at a glance', () => {
    expect(validateSlug('my--bank').reason).toBe('consecutive_hyphens');
  });
});

describe('AC-003 — the validation layer refuses reserved slugs', () => {
  it('rejects a reserved slug', () => {
    expect(createSiteSchema.safeParse({ slug: 'admin', name: 'Admin Store' }).success).toBe(false);
  });

  it('rejects a bank-lookalike slug', () => {
    expect(createSiteSchema.safeParse({ slug: 'gtbank-ng', name: 'Shop' }).success).toBe(false);
  });

  it('accepts a legitimate slug', () => {
    expect(createSiteSchema.safeParse({ slug: 'ade-store', name: 'Ade Store' }).success).toBe(true);
  });
});

describe('AC-003 — the model layer refuses reserved slugs too', () => {
  it('fails validation for a reserved slug', async () => {
    const site = new Site({
      slug: 'api',
      name: 'Sneaky',
      ownerId: new Types.ObjectId(),
      planCode: 'free',
    });
    await expect(site.validate()).rejects.toThrow(/not an available subdomain/);
  });

  it('accepts a legitimate slug', async () => {
    const site = new Site({
      slug: 'ade-store',
      name: 'Ade Store',
      ownerId: new Types.ObjectId(),
      planCode: 'free',
    });
    await expect(site.validate()).resolves.toBeUndefined();
  });
});

describe('host normalisation', () => {
  it('strips port, case, and trailing dot', () => {
    expect(normalizeHostname('Ade-Store.HORDEMART.com:3000')).toBe('ade-store.hordemart.com');
    expect(normalizeHostname('hordemart.com.')).toBe('hordemart.com');
  });
});

describe('host resolution', () => {
  it('identifies the dashboard host', () => {
    expect(resolveHost('app.hordemart.com', config).kind).toBe('app');
  });

  it('identifies the apex', () => {
    expect(resolveHost('hordemart.com', config).kind).toBe('apex');
  });

  it('extracts a tenant slug', () => {
    const resolved = resolveHost('ade-store.hordemart.com', config);
    expect(resolved.kind).toBe('tenant');
    expect(resolved.slug).toBe('ade-store');
  });

  it('ignores the port', () => {
    expect(resolveHost('ade-store.hordemart.com:3000', config).slug).toBe('ade-store');
  });

  it('is case-insensitive', () => {
    expect(resolveHost('Ade-Store.HORDEMART.com', config).slug).toBe('ade-store');
  });

  it('refuses a reserved subdomain as a tenant', () => {
    expect(resolveHost('admin.hordemart.com', config).kind).toBe('invalid');
    expect(resolveHost('gtbank.hordemart.com', config).kind).toBe('invalid');
  });

  it('refuses nested labels, so evil.gtbank.<root> cannot pose as a tenant', () => {
    expect(resolveHost('evil.gtbank.hordemart.com', config).kind).toBe('invalid');
    expect(resolveHost('a.b.hordemart.com', config).kind).toBe('invalid');
  });

  it('treats an unrelated domain as a candidate custom domain', () => {
    const resolved = resolveHost('shop.example.ng', config);
    expect(resolved.kind).toBe('custom-domain');
    expect(resolved.domain).toBe('shop.example.ng');
  });

  it('does not mistake a suffix lookalike for the apex', () => {
    // "nothordemart.com" ends with "hordemart.com" as a raw substring only.
    expect(resolveHost('nothordemart.com', config).kind).toBe('custom-domain');
  });

  it('refuses a missing or empty host', () => {
    expect(resolveHost(null, config).kind).toBe('invalid');
    expect(resolveHost(undefined, config).kind).toBe('invalid');
    expect(resolveHost('', config).kind).toBe('invalid');
  });

  it('refuses a malformed tenant label', () => {
    expect(resolveHost('-bad.hordemart.com', config).kind).toBe('invalid');
    expect(resolveHost('ab.hordemart.com', config).kind).toBe('invalid'); // too short
  });
});

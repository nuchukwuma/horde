/**
 * Pure pieces of the storefront and catalogue work: brand contrast, product
 * image ownership, Cloudinary signing, and the CSP nonce plumbing. None of
 * these need a database.
 */

import { describe, expect, it } from 'vitest';
import { contrastRatio, readableInkFor } from '../../src/lib/ui/contrast';
import {
  assertOwnProductImages,
  productImageFolder,
  signCloudinaryParams,
  signProductUpload,
} from '../../src/lib/products/images';
import { buildCsp, generateNonce } from '../../src/lib/security/csp';
import { createProductSchema } from '../../src/lib/validation/schemas';

describe('brand colour contrast', () => {
  it('puts white text on a deep accent and dark text on a pale one', () => {
    expect(readableInkFor('#0f6b4a')).toBe('#ffffff');
    expect(readableInkFor('#f4d35e')).toBe('#111111');
  });

  it('always lands at or above WCAG AA for large text', () => {
    for (const accent of ['#ff0000', '#00ff00', '#0000ff', '#888888', '#f4b93e', '#2b3a8c']) {
      expect(contrastRatio(accent, readableInkFor(accent)), accent).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('product photo ownership', () => {
  const config = { cloudName: 'hordemart', apiKey: 'k', apiSecret: 's' };
  const siteId = '64b7f0c2a1b2c3d4e5f60718';
  const folder = productImageFolder(siteId);

  it('accepts an upload in this site\'s folder on our cloud', () => {
    const publicId = `${folder}/abc123`;
    const [image] = assertOwnProductImages(
      [{ cloudinaryPublicId: publicId, url: `https://res.cloudinary.com/hordemart/image/upload/v1712/${publicId}.jpg` }],
      siteId,
      config,
    );
    expect(image.cloudinaryPublicId).toBe(publicId);
  });

  it('refuses another store\'s photo', () => {
    const other = `${productImageFolder('64b7f0c2a1b2c3d4e5f60799')}/abc`;
    expect(() =>
      assertOwnProductImages(
        [{ cloudinaryPublicId: other, url: `https://res.cloudinary.com/hordemart/image/upload/${other}.jpg` }],
        siteId,
        config,
      ),
    ).toThrow(/uploaded from this dashboard/);
  });

  it('refuses a photo on someone else\'s Cloudinary account', () => {
    const publicId = `${folder}/abc`;
    expect(() =>
      assertOwnProductImages(
        [{ cloudinaryPublicId: publicId, url: `https://res.cloudinary.com/attacker/image/upload/${publicId}.jpg` }],
        siteId,
        config,
      ),
    ).toThrow();
  });

  it('refuses a URL that does not match the public id it claims', () => {
    expect(() =>
      assertOwnProductImages(
        [
          {
            cloudinaryPublicId: `${folder}/mine`,
            url: `https://res.cloudinary.com/hordemart/image/upload/${productImageFolder('64b7f0c2a1b2c3d4e5f60799')}/theirs.jpg`,
          },
        ],
        siteId,
        config,
      ),
    ).toThrow();
  });

  it('refuses any image when uploads are not configured', () => {
    expect(() =>
      assertOwnProductImages([{ cloudinaryPublicId: `${folder}/a`, url: 'https://res.cloudinary.com/x/image/upload/a.jpg' }], siteId, null),
    ).toThrow(/not configured/);
  });
});

describe('Cloudinary upload signing', () => {
  it('matches Cloudinary\'s documented example signature', () => {
    // https://cloudinary.com/documentation/authentication_signatures
    expect(
      signCloudinaryParams(
        { eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop', public_id: 'sample_image', timestamp: 1315060510 },
        'abcd',
      ),
    ).toBe('bfd09f95f331f558cbd1320e67aa8d488770583e');
  });

  it('signs only this site\'s folder and never returns the secret', () => {
    const signed = signProductUpload('64b7f0c2a1b2c3d4e5f60718', { cloudName: 'c', apiKey: 'k', apiSecret: 'TOPSECRET' }, 1_700_000_000_000);
    expect(signed.folder).toBe('hordemart/64b7f0c2a1b2c3d4e5f60718/products');
    expect(JSON.stringify(signed)).not.toContain('TOPSECRET');
  });
});

describe('product input', () => {
  it('takes price as a naira string, so it never passes through a float', () => {
    expect(createProductSchema.safeParse({ title: 'Adire', priceNaira: 2500 }).success).toBe(false);
    expect(createProductSchema.safeParse({ title: 'Adire', priceNaira: '2500.50' }).success).toBe(true);
    expect(createProductSchema.safeParse({ title: 'Adire', priceNaira: '2500.505' }).success).toBe(false);
  });

  it('does not accept a client-chosen slug', () => {
    const parsed = createProductSchema.parse({ title: 'Adire', priceNaira: '2500', slug: 'evil' });
    expect(parsed).not.toHaveProperty('slug');
  });
});

describe('CSP nonce', () => {
  it('mints a fresh, unguessable nonce each time', () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).not.toBe(b);
    expect(Buffer.from(a, 'base64')).toHaveLength(16);
  });

  it('lets only nonced scripts run on a storefront, never inline ones', () => {
    const csp = buildCsp({ hostKind: 'tenant', isDev: false, adsEnabled: true, nonce: 'abc' });
    const scriptSrc = csp.split('; ').find((part) => part.startsWith('script-src'));
    expect(scriptSrc).toBe("script-src 'self' 'nonce-abc' 'strict-dynamic'");
  });

  it('allows Cloudinary uploads from the dashboard host only', () => {
    expect(buildCsp({ hostKind: 'app', isDev: false, adsEnabled: false })).toContain('https://api.cloudinary.com');
    expect(buildCsp({ hostKind: 'tenant', isDev: false, adsEnabled: false })).not.toContain('api.cloudinary.com');
  });
});

import { describe, expect, it } from 'vitest';
import { IMAGE_WIDTHS, imageUrlAt, responsiveImage } from '@/lib/media/responsiveImage';

const stored = {
  url: 'https://res.cloudinary.com/hordemart/image/upload/v1712345678/sites/abc/products/shoe-1.jpg',
  cloudinaryPublicId: 'sites/abc/products/shoe-1',
  width: 1600,
  height: 1200,
};

describe('storefront photos sized for the screen', () => {
  it('asks Cloudinary for a modern format, its own quality, and no upscaling, at the width needed', () => {
    expect(imageUrlAt(stored, 480)).toBe(
      'https://res.cloudinary.com/hordemart/image/upload/f_auto,q_auto,c_limit,w_480/v1712345678/sites/abc/products/shoe-1',
    );
  });

  it('offers every width up to the stored size, and a small default src', () => {
    const { src, srcSet } = responsiveImage(stored, 640);
    expect(src).toContain('w_640/');
    expect(srcSet!.split(', ')).toHaveLength(IMAGE_WIDTHS.length + 1);
    expect(srcSet).toContain('w_240/');
    expect(srcSet).toContain(' 1600w');
  });

  it('never offers a width larger than the photo itself', () => {
    const small = { ...stored, width: 500, height: 500 };
    const { src, srcSet } = responsiveImage(small, 640);
    expect(src).toContain('w_500/');
    const widths = srcSet!.split(', ').map((entry) => Number(entry.split(' ')[1]!.replace('w', '')));
    expect(Math.max(...widths)).toBe(500);
  });

  it('works out the id from a bare URL (cart lines), without the extension', () => {
    expect(imageUrlAt({ url: stored.url }, 160)).toBe(
      'https://res.cloudinary.com/hordemart/image/upload/f_auto,q_auto,c_limit,w_160/v1712345678/sites/abc/products/shoe-1',
    );
  });

  it('leaves anything that is not one of our Cloudinary photos exactly as it is', () => {
    for (const url of [
      'https://example.com/photo.jpg',
      'https://res.cloudinary.com.evil.test/image/upload/v1/x.jpg',
      'http://res.cloudinary.com/hordemart/image/upload/v1/x.jpg',
      'https://res.cloudinary.com/hordemart/image/upload/c_fill,w_100/x.jpg',
    ]) {
      expect(imageUrlAt({ url }, 320)).toBe(url);
      expect(responsiveImage({ url }).srcSet).toBeUndefined();
    }
  });

  it('refuses ids that try to climb out of their folder', () => {
    expect(imageUrlAt({ ...stored, cloudinaryPublicId: 'sites/../other' }, 320)).toBe(stored.url);
  });

  it('encodes odd characters in the id instead of passing them into the URL', () => {
    const url = imageUrlAt({ ...stored, cloudinaryPublicId: 'sites/abc/products/a b?c' }, 320);
    expect(url.endsWith('/sites/abc/products/a%20b%3Fc')).toBe(true);
  });
});

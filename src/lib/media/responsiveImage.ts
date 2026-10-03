/**
 * Photos sized for the screen showing them.
 *
 * Uploads are stored at up to 1600px (lib/products/images.ts). Serving that
 * file to a 170px product card on a phone costs a buyer on mobile data
 * several hundred KB per photo. Cloudinary resizes and re-encodes from the
 * URL, so each <img> instead offers a few widths (srcset) and the browser
 * picks the smallest that is sharp on that screen:
 *
 *   f_auto   WebP or AVIF where the phone supports it, JPEG/PNG where not
 *   q_auto   Cloudinary's perceptual quality setting
 *   c_limit  never upscale past the stored size
 *
 * Only our own Cloudinary URLs are rewritten. Anything else (an image from
 * the seed script, say) is returned as it is.
 */

export interface StoredImage {
  url: string;
  cloudinaryPublicId?: string;
  width?: number;
  height?: number;
  alt?: string;
}

/** The widths offered. Enough steps that no phone downloads much more than it shows. */
export const IMAGE_WIDTHS = [240, 360, 480, 640, 800, 1080, 1440] as const;

const UPLOAD = /^https:\/\/res\.cloudinary\.com\/([a-z0-9_-]{1,64})\/image\/upload\/(.+)$/i;

/**
 * Cloud name, version and public id of one of our Cloudinary photos. The id
 * comes from the stored record when there is one; a bare URL (a cart line)
 * gives it after its version segment, minus the extension, since f_auto
 * chooses the format.
 */
function parse(image: StoredImage): { cloud: string; version: string | null; publicId: string } | null {
  if (!image?.url) return null;
  const match = UPLOAD.exec(image.url);
  if (!match) return null;
  const segments = match[2]!.split(/[?#]/)[0]!.split('/');
  const at = segments.findIndex((segment) => /^v\d+$/.test(segment));
  const version = at >= 0 ? segments[at]! : null;
  let publicId = image.cloudinaryPublicId;
  if (!publicId) {
    // Without a version segment there is no telling transformations from the id.
    if (at < 0) return null;
    publicId = segments.slice(at + 1).join('/').replace(/\.[a-z0-9]{2,5}$/i, '');
  }
  if (!publicId || publicId.includes('..')) return null;
  return { cloud: match[1]!, version, publicId };
}

/** One size of a stored photo, or the stored URL when it is not one of ours. */
export function imageUrlAt(image: StoredImage, width: number): string {
  const parsed = parse(image);
  if (!parsed) return image.url;
  const w = Math.max(16, Math.min(Math.round(width), 1600));
  const id = parsed.publicId.split('/').map(encodeURIComponent).join('/');
  const version = parsed.version ? `${parsed.version}/` : '';
  return `https://res.cloudinary.com/${parsed.cloud}/image/upload/f_auto,q_auto,c_limit,w_${w}/${version}${id}`;
}

/**
 * src + srcset for an <img>. Widths above the stored width are dropped
 * (c_limit would only return the same file again under another URL).
 */
export function responsiveImage(image: StoredImage, fallbackWidth = 640): { src: string; srcSet?: string } {
  if (!parse(image)) return { src: image.url };
  const max = image.width && image.width > 0 ? image.width : 1600;
  const widths = IMAGE_WIDTHS.filter((w) => w <= max);
  if (widths.length === 0 || widths[widths.length - 1]! < max) widths.push(Math.min(max, 1600) as never);
  return {
    src: imageUrlAt(image, Math.min(fallbackWidth, max)),
    srcSet: widths.map((w) => `${imageUrlAt(image, w)} ${w}w`).join(', '),
  };
}

/** `sizes` for the places a storefront shows photos, matching storefront.css. */
export const IMAGE_SIZES = {
  // 2 columns on phones, 3 from 720px, 4 from 1040px in a 1180px container.
  productCard: '(min-width: 1040px) 280px, (min-width: 720px) 31vw, 46vw',
  // Category tiles: 2 columns, 4 from 760px.
  categoryTile: '(min-width: 1180px) 280px, (min-width: 760px) 23vw, 46vw',
  hero: '100vw',
  // Image + text: one column on phones, half the container from 720px.
  split: '(min-width: 1180px) 570px, (min-width: 720px) 48vw, 100vw',
  // Product page main photo: full width on phones, about half from 900px.
  productMain: '(min-width: 1180px) 600px, (min-width: 900px) 52vw, 100vw',
  thumb: '120px',
} as const;

/**
 * Product photos, uploaded by the seller's browser straight to Cloudinary.
 *
 * The file never passes through our servers. We sign an upload that is only
 * good for one folder — this site's — and for a short time; Cloudinary checks
 * the signature, stores the file, and hands the browser back a URL. When the
 * product is saved, the URL is checked here again before it is stored, because
 * the browser is the one reporting it.
 *
 * Why the folder check matters: without it a seller could save another
 * store's image URL as their own (harmless-looking, but it lets one tenant's
 * catalogue depend on another's assets), or a URL on someone else's Cloudinary
 * account entirely, which then renders on a storefront whose CSP allows
 * res.cloudinary.com.
 *
 * Unconfigured (no CLOUDINARY_* variables), uploads are simply unavailable and
 * products render with generated art. That is a feature state, not an error.
 */

import { createHash } from 'node:crypto';
import { ValidationError } from '../errors';

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

export function cloudinaryConfig(
  env: Record<string, string | undefined> = process.env,
): CloudinaryConfig | null {
  const cloudName = env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = env.CLOUDINARY_API_SECRET?.trim();
  if (!cloudName || !apiKey || !apiSecret) return null;
  // Cloud names are short identifiers; anything else is a misconfiguration
  // that would otherwise be interpolated into a URL.
  if (!/^[a-z0-9_-]{1,64}$/i.test(cloudName)) return null;
  return { cloudName, apiKey, apiSecret };
}

export type UploadPurpose = 'products' | 'design';

/** Each site's uploads live in their own folders, which is what saves are checked against. */
export function siteImageFolder(siteId: string, purpose: UploadPurpose): string {
  return `hordemart/${siteId}/${purpose}`;
}

export function productImageFolder(siteId: string): string {
  return siteImageFolder(siteId, 'products');
}

/**
 * The longest side an uploaded image is stored at.
 *
 * Applied by Cloudinary as a signed *incoming* transformation, so the
 * original is never kept: a 12 MB phone photo is stored as a ~1600px image.
 * Because it is part of the signature, a browser cannot drop it.
 */
export const MAX_IMAGE_DIMENSION = 1600;
export const INCOMING_TRANSFORMATION = `c_limit,w_${MAX_IMAGE_DIMENSION},h_${MAX_IMAGE_DIMENSION},q_auto:good`;

/**
 * Cloudinary's request signature: SHA-1 of the sorted parameters, then the secret.
 * https://cloudinary.com/documentation/authentication_signatures
 */
export function signCloudinaryParams(
  params: Record<string, string | number>,
  apiSecret: string,
): string {
  const payload = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return createHash('sha1').update(`${payload}${apiSecret}`).digest('hex');
}

export interface SignedUpload {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  /** Must be sent back verbatim with the upload; it is part of the signature. */
  transformation: string;
  signature: string;
  uploadUrl: string;
}

/**
 * Sign one upload into this site's folder.
 *
 * The API secret stays here; only the signature leaves. Cloudinary rejects a
 * signature older than an hour, which bounds how long a leaked one is useful.
 */
export function signProductUpload(
  siteId: string,
  config: CloudinaryConfig,
  now = Date.now(),
  purpose: UploadPurpose = 'products',
): SignedUpload {
  const timestamp = Math.floor(now / 1000);
  const folder = siteImageFolder(siteId, purpose);
  const transformation = INCOMING_TRANSFORMATION;
  const signature = signCloudinaryParams({ folder, timestamp, transformation }, config.apiSecret);

  return {
    cloudName: config.cloudName,
    apiKey: config.apiKey,
    timestamp,
    folder,
    transformation,
    signature,
    uploadUrl: `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`,
  };
}

export interface ProductImageInput {
  cloudinaryPublicId: string;
  url: string;
  width?: number;
  height?: number;
  alt?: string;
}

/**
 * Accept an image only if it is on our cloud, in this site's folder.
 *
 * Throws rather than filtering: a product saved with its photo silently
 * dropped is a worse surprise than an error that says why.
 */
export function assertOwnProductImages(
  images: ProductImageInput[],
  siteId: string,
  config: CloudinaryConfig | null = cloudinaryConfig(),
): ProductImageInput[] {
  return assertOwnImages(images, siteId, 'products', config);
}

export function assertOwnImages(
  images: ProductImageInput[],
  siteId: string,
  purpose: UploadPurpose,
  config: CloudinaryConfig | null = cloudinaryConfig(),
): ProductImageInput[] {
  if (images.length === 0) return images;
  if (!config) {
    throw new ValidationError('Photo uploads are not configured on this server');
  }

  const folder = `${siteImageFolder(siteId, purpose)}/`;
  const prefix = `https://res.cloudinary.com/${config.cloudName}/image/upload/`;

  return images.map((image) => {
    let url: URL;
    try {
      url = new URL(image.url);
    } catch {
      throw new ValidationError('That photo address is not valid');
    }

    const publicId = image.cloudinaryPublicId;
    const href = url.href;

    // The path after /upload/ may carry a version segment (v1712345678/) and
    // then the public id, so the id must appear after the fixed prefix.
    const inOurCloud = url.protocol === 'https:' && href.startsWith(prefix);
    const inThisSite = publicId.startsWith(folder) && !publicId.includes('..');
    const urlMatchesId = href.includes(`/${publicId}.`) || href.endsWith(`/${publicId}`);

    if (!inOurCloud || !inThisSite || !urlMatchesId) {
      throw new ValidationError('Photos must be uploaded from this dashboard');
    }

    return {
      cloudinaryPublicId: publicId,
      url: href,
      width: image.width,
      height: image.height,
      alt: image.alt,
    };
  });
}

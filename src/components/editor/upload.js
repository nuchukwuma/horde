'use client';

/**
 * Upload one image straight from the browser to Cloudinary, using a
 * signature from our server that is good for one folder of one store, with a
 * built-in size limit (lib/products/images.ts INCOMING_TRANSFORMATION).
 *
 * The browser checks size and type first, so a seller on mobile data does
 * not spend 12 MB uploading a photo that would be refused or shrunk anyway.
 */

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export class UploadError extends Error {}

export async function uploadImage(siteId, file, purpose = 'design') {
  if (!TYPES.includes(file.type)) throw new UploadError('Use a JPG, PNG or WebP photo.');
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadError(`That photo is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 5 MB.`);
  }

  const signed = await fetch(`/api/sites/${siteId}/uploads/sign?purpose=${purpose}`, { method: 'POST' });
  if (signed.status === 404) throw new UploadError('Photo uploads are not set up on this server yet.');
  const sig = await signed.json();
  if (!signed.ok) throw new UploadError(sig?.error?.message ?? 'Could not start the upload.');

  const form = new FormData();
  form.append('file', file);
  form.append('api_key', sig.data.apiKey);
  form.append('timestamp', String(sig.data.timestamp));
  form.append('folder', sig.data.folder);
  form.append('transformation', sig.data.transformation);
  form.append('signature', sig.data.signature);

  const response = await fetch(sig.data.uploadUrl, { method: 'POST', body: form });
  const body = await response.json();
  if (!response.ok) throw new UploadError(body?.error?.message ?? 'The upload failed. Try again.');

  return {
    cloudinaryPublicId: body.public_id,
    url: body.secure_url,
    width: body.width,
    height: body.height,
  };
}

/**
 * Blog cover photos and portfolio images must be this store's own uploads,
 * exactly like product photos (lib/products/images.ts): on our Cloudinary
 * account, in this site's content folder. These used to be stored as sent,
 * so any URL the browser reported became part of the store.
 *
 * On an edit, an image the document already holds is kept as is, so content
 * created before this check (or by the seed script) can still be edited
 * without re-uploading every photo.
 */

import { assertOwnImages, type ProductImageInput } from '../products/images';
import { requireTenantId } from '../tenant/context';

export function checkContentImages<T extends ProductImageInput>(
  images: T[],
  modelName: string,
  existing: Array<{ url: string }> = [],
): T[] {
  const kept = new Set(existing.map((image) => image.url));
  const fresh = images.filter((image) => !kept.has(image.url));
  if (fresh.length > 0) assertOwnImages(fresh, requireTenantId(modelName), 'content');
  return images;
}

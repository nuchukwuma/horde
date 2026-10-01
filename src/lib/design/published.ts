/**
 * The storefront's read of a store's live design, cached.
 *
 * Storefront pages render per request (the CSP nonce requires it), but the
 * design they render changes only when a seller presses Publish. So the read
 * is cached per site and tagged; the publish route calls
 * revalidateTag(designTag(siteId)) and the next request sees the new design —
 * no redeploy, no waiting out a TTL. The TTL below is only a backstop for a
 * publish whose revalidation call was somehow lost.
 */

import { unstable_cache } from 'next/cache';
import { runWithTenant } from '../tenant/context';
import { normalisePage, readPublishedDesign } from './service';

export function designTag(siteId: string): string {
  return `site-design:${siteId}`;
}

export async function getPublishedDesign(siteId: string, slug: string) {
  const design = await unstable_cache(
    () => runWithTenant({ siteId, slug }, () => readPublishedDesign()),
    ['site-design', 'v2', siteId],
    { tags: [designTag(siteId)], revalidate: 600 },
  )();
  // Normalised outside the cache as well, so an entry cached by older code
  // can never hand the renderer a page without `root`.
  return design ? { ...design, page: normalisePage(design.page) } : null;
}

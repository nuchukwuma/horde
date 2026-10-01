/**
 * Resolve the storefront a page is rendering, or 404.
 *
 * Every page under app/storefront/[slug] calls this instead of reading the
 * slug from its params and trusting it. The params come from the URL path;
 * the header comes from middleware, which derived it from the Host. They agree
 * on every request that arrived through the rewrite, and on nothing else — so
 * this is the second of the two locks that keep the storefront tree from being
 * addressed directly (middleware's 404 on the prefix is the first).
 *
 * Wrapped in React's per-request `cache`, so the layout and the page share one
 * Site lookup instead of each making their own.
 */

import { cache } from 'react';
import { headers } from 'next/headers';
import { notFound, permanentRedirect } from 'next/navigation';
import type { SiteDocument } from '../db/models/Site';
import { connectToDatabase } from '../db/connect';
import { findSiteBySlug } from './loadSite';
import { TENANT_PATH_HEADER, TENANT_SLUG_HEADER } from './headers';
import { findSiteByRetiredSlug } from './changeSlug';
import { siteOrigin } from '../seo/meta';

const loadActiveSite = cache(async (slug: string): Promise<SiteDocument | null> => {
  await connectToDatabase();
  const site = await findSiteBySlug(slug);
  // Suspended and closed stores look absent to the public, not broken.
  return site && site.status === 'active' ? site : null;
});

export async function requireStorefront(
  params: Promise<{ slug: string }> | { slug: string },
): Promise<SiteDocument> {
  const { slug } = await params;
  const requestHeaders = await headers();
  const fromHost = requestHeaders.get(TENANT_SLUG_HEADER);

  if (!fromHost || fromHost !== slug) notFound();

  const site = await loadActiveSite(slug);
  if (site) return site;

  // An address the store used to have: send the visitor to the same page on
  // its current address. 308, so links shared in old WhatsApp statuses keep
  // working and search engines move the listing.
  const moved = await findSiteByRetiredSlug(slug);
  if (moved) {
    const path = requestHeaders.get(TENANT_PATH_HEADER) ?? '/';
    const safePath = path.startsWith('/') && !path.startsWith('//') ? path : '/';
    permanentRedirect(`${siteOrigin(moved)}${safePath}`);
  }
  notFound();
}

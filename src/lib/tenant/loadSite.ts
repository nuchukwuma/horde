/**
 * The bridge between the Edge middleware's header and the Node runtime's tenant
 * context.
 *
 * Middleware can only parse the host — Mongoose does not run on the Edge. This
 * module does the database half: slug in, ambient tenant established.
 */

import { Site, type SiteAttributes } from '../db/models/Site';
import { NotFoundError } from '../errors';
import { runWithTenant, runWithoutTenantScope } from './context';
import { isReservedSlug } from './reserved';

export const TENANT_SLUG_HEADER = 'x-hm-site-slug';
export const TENANT_HOST_HEADER = 'x-hm-host-kind';

/**
 * Look up a Site by slug.
 *
 * Runs outside tenant scope by necessity: this call is what determines the
 * tenant, so it cannot already be inside one.
 */
export async function findSiteBySlug(slug: string): Promise<SiteAttributes | null> {
  if (isReservedSlug(slug)) return null;

  return runWithoutTenantScope(
    'resolving host to a Site, which is what establishes tenant scope',
    () => Site.findOne({ slug, status: { $ne: 'closed' } }),
  );
}

/**
 * Run `fn` with the site identified by `slug` as the ambient tenant.
 *
 * Every tenant-owned query inside is automatically filtered to it. This is the
 * only intended way to enter tenant scope in request handling.
 */
export async function withSiteBySlug<T>(
  slug: string,
  fn: (site: SiteAttributes) => Promise<T>,
): Promise<T> {
  const site = await findSiteBySlug(slug);
  if (!site) throw new NotFoundError('Site');

  return runWithTenant({ siteId: String(site._id), slug: site.slug }, () => fn(site));
}

/** Same, for code paths that already hold a Site document. */
export async function withSite<T>(
  site: SiteAttributes,
  fn: () => Promise<T>,
): Promise<T> {
  return runWithTenant({ siteId: String(site._id), slug: site.slug }, fn);
}

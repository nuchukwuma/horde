/**
 * Change a store's address (its subdomain).
 *
 * The rules, and why:
 *   - Same validation as signup (slugSchema): lowercase letters, digits and
 *     single hyphens; 3–30 characters; never a reserved name (app, www,
 *     admin, api, …) — a store at api.hordemart.com would be a phishing page
 *     with our name on it.
 *   - Unique against live stores AND every address any store has ever had.
 *   - The old address is retired permanently and redirects to the new one,
 *     so links already shared in WhatsApp statuses keep working.
 *   - Callers require a recently re-confirmed password and rate-limit this
 *     (3 changes per 30 days): a store's address is what its customers
 *     trust, and churning it is a fraud pattern.
 *
 * Effects the seller should know about: signed-in shoppers are signed out
 * (storefront cookies are host-only to the old address), and anywhere the
 * old address was printed now relies on the redirect.
 */

import type { Types } from 'mongoose';
import { Site, type SiteDocument } from '../db/models/Site';
import { SlugHistory } from '../db/models/SlugHistory';
import { slugSchema } from '../validation/schemas';
import { ConflictError, ValidationError } from '../errors';
import { isSlugAvailable } from '../onboarding/signup';
import { recordAudit } from '../audit';
import { runWithoutTenantScope } from './context';

export interface ChangeSlugInput {
  site: SiteDocument;
  slug: string;
  actorUserId: Types.ObjectId;
  actorRole: string;
  ip?: string;
  userAgent?: string;
}

export async function changeSiteSlug(input: ChangeSlugInput): Promise<{ slug: string; previous: string }> {
  const slug = slugSchema.parse(input.slug);
  const previous = input.site.slug;
  if (slug === previous) throw new ValidationError('That is already your address');

  if (!(await isSlugAvailable(slug))) {
    throw new ConflictError(`The address ${slug} is not available.`, { field: 'slug' });
  }

  // Retire the old address first. If the rename then loses a race, the
  // retired record points at the right site and the redirect still works;
  // the reverse order could leave the old address briefly claimable.
  await SlugHistory.updateOne(
    { slug: previous },
    { $setOnInsert: { slug: previous, siteId: input.site._id, retiredBy: input.actorUserId } },
    { upsert: true },
  );

  try {
    await runWithoutTenantScope('renaming a Site, which is the tenant root and not tenant-scoped', () =>
      Site.updateOne({ _id: input.site._id, slug: previous }, { $set: { slug } }),
    );
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      throw new ConflictError(`The address ${slug} was taken just now.`, { field: 'slug' });
    }
    throw error;
  }

  await recordAudit({
    action: 'site.slug.changed',
    siteId: input.site._id,
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    targetType: 'Site',
    targetId: String(input.site._id),
    before: { slug: previous },
    after: { slug },
    ip: input.ip,
    userAgent: input.userAgent,
  });

  return { slug, previous };
}

/** For the storefront: which site, if any, used to live at this address. */
export async function findSiteByRetiredSlug(slug: string): Promise<SiteDocument | null> {
  const retired = await SlugHistory.findOne({ slug }).select('siteId').lean();
  if (!retired) return null;
  return runWithoutTenantScope('following a retired store address to its current Site', () =>
    Site.findOne({ _id: retired.siteId, status: 'active' }),
  );
}

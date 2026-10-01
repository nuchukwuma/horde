/**
 * Content quotas: what separates Free from Premium.
 *
 * Read from src/config/plans.ts by the site's planCode, so the numbers a
 * seller is shown and the numbers enforced cannot differ. Every function runs
 * inside the caller's tenant scope, so counts are this store's only.
 *
 * Existing content is never deleted or hidden when a store drops back to
 * Free: it simply cannot add more until it is under the limit again.
 */

import type { SiteDocument } from '../db/models/Site';
import { Product } from '../db/models/Product';
import { Post } from '../db/models/Post';
import { Project } from '../db/models/Project';
import { AppError } from '../errors';
import { TIERS, tierFor, type TierLimits } from '../../config/plans';

export type QuotaKind = 'products' | 'posts' | 'projects';

const NOUN: Record<QuotaKind, [string, string]> = {
  products: ['product', 'products'],
  posts: ['journal post', 'journal posts'],
  projects: ['portfolio project', 'portfolio projects'],
};

export class QuotaExceededError extends AppError {
  constructor(message: string, details: { kind: string; limit: number; premiumLimit: number }) {
    super(409, 'quota_exceeded', message, { details });
  }
}

async function countActive(kind: QuotaKind): Promise<number> {
  const filter = { status: { $ne: 'archived' } };
  if (kind === 'products') return Product.countDocuments(filter);
  if (kind === 'posts') return Post.countDocuments(filter);
  return Project.countDocuments(filter);
}

export function limitsFor(site: Pick<SiteDocument, 'planCode'>): TierLimits {
  return tierFor(site.planCode).limits;
}

/** Throw unless this store can add one more of `kind`. */
export async function assertQuota(site: Pick<SiteDocument, 'planCode'>, kind: QuotaKind): Promise<void> {
  const tier = tierFor(site.planCode);
  const limit = tier.limits[kind];
  const used = await countActive(kind);
  if (used < limit) return;

  const [one, many] = NOUN[kind];
  const premium = TIERS.pro.limits[kind];
  const message =
    tier.code === 'pro'
      ? `You have reached the limit of ${limit} ${many}. Archive one to add another.`
      : `The Free plan allows ${limit} ${many}. Archive a ${one}, or upgrade to Premium for up to ${premium}.`;
  throw new QuotaExceededError(message, { kind, limit, premiumLimit: premium });
}

export function assertImageCount(site: Pick<SiteDocument, 'planCode'>, count: number): void {
  const limit = limitsFor(site).imagesPerProduct;
  if (count <= limit) return;
  throw new QuotaExceededError(
    `Your plan allows ${limit} photos per product.${site.planCode === 'pro' ? '' : ` Premium allows ${TIERS.pro.limits.imagesPerProduct}.`}`,
    { kind: 'imagesPerProduct', limit, premiumLimit: TIERS.pro.limits.imagesPerProduct },
  );
}

export interface Usage {
  products: number;
  posts: number;
  projects: number;
}

export async function usageFor(): Promise<Usage> {
  const [products, posts, projects] = await Promise.all([
    countActive('products'),
    countActive('posts'),
    countActive('projects'),
  ]);
  return { products, posts, projects };
}

/**
 * Module gating.
 *
 * A Site enables Store, Portfolio and Blog independently, and the plan can cap
 * which are available at all. Both checks belong together: a seller who
 * downgrades should lose the module, and a module the seller switched off
 * should 404 rather than serve an empty page that search engines then index.
 */

import { Plan } from '../db/models/Plan';
import type { SiteDocument } from '../db/models/Site';
import { NotFoundError, ForbiddenError } from '../errors';
import { runWithoutTenantScope } from '../tenant/context';

export type SiteModule = 'store' | 'portfolio' | 'blog';

export function isModuleEnabled(site: SiteDocument, module: SiteModule): boolean {
  return site.modules[module] === true;
}

/**
 * 404 rather than 403 when a module is off.
 *
 * A seller who has not enabled a blog does not have a blog, and saying
 * "forbidden" would confirm the site exists with the feature disabled — a
 * detail no anonymous visitor needs.
 */
export function assertModuleEnabled(site: SiteDocument, module: SiteModule): void {
  if (!isModuleEnabled(site, module)) {
    throw new NotFoundError('Page');
  }
}

/**
 * Whether the site's plan permits a module at all.
 *
 * Separate from the on/off switch: this is what a downgrade enforces, and it
 * throws Forbidden because the seller IS authenticated and does need to know
 * their plan is the blocker.
 */
export async function assertModuleAllowedByPlan(
  site: SiteDocument,
  module: SiteModule,
): Promise<void> {
  const plan = await runWithoutTenantScope(
    'reading a Plan, which is platform-level configuration and not tenant-owned',
    () => Plan.findOne({ code: site.planCode, active: true }).lean(),
  );

  // A missing plan must not silently grant everything.
  if (!plan) {
    throw new ForbiddenError(`Plan "${site.planCode}" is not available`);
  }

  if (!plan.limits.modules.includes(module)) {
    throw new ForbiddenError(
      `The ${plan.name} plan does not include the ${module} module`,
    );
  }
}

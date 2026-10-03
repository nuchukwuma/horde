/**
 * PATCH /api/sites/:siteId/modules  { blog?: boolean, portfolio?: boolean }
 *
 * Switch the site's Blog and Portfolio sections on or off. The owner only:
 * it changes what the public site is. Switching one on needs a plan that
 * includes it. The shop itself is not switched here — turning a shop off
 * with orders in flight is not a toggle.
 *
 * Switching off hides the section (it 404s) but deletes nothing: posts and
 * projects come back when it is switched on again.
 */

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { requireSiteAccess } from '@/lib/auth/guards';
import { Membership } from '@/lib/db/models/Membership';
import { ForbiddenError } from '@/lib/errors';
import { Site } from '@/lib/db/models/Site';
import { assertModuleAllowedByPlan } from '@/lib/content/modules';
import { runWithoutTenantScope } from '@/lib/tenant/context';
import { recordAudit } from '@/lib/audit';

export const runtime = 'nodejs';

const modulesSchema = z
  .object({ blog: z.boolean().optional(), portfolio: z.boolean().optional() })
  .strict()
  .refine((body) => body.blog !== undefined || body.portfolio !== undefined, 'Nothing to change');

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  try {
    const { siteId } = await params;
    const session = await requireSession(request, 'platform');
    const access = await requireSiteAccess(session, siteId, ['owner']);
    // The real owner: a platform admin passes requireSiteAccess on every
    // store, but what a store's public site shows is its owner's decision.
    const owner = await Membership.exists({ userId: session.user._id, siteId: access.site._id, role: 'owner' });
    if (!owner) {
      throw new ForbiddenError('Not the store owner', 'Only the store owner can switch sections of the site on or off.');
    }
    const change = modulesSchema.parse(await request.json());

    const set: Record<string, boolean> = {};
    for (const section of ['blog', 'portfolio'] as const) {
      const value = change[section];
      if (value === undefined) continue;
      if (value) await assertModuleAllowedByPlan(access.site, section);
      set[`modules.${section}`] = value;
    }

    const updated = await runWithoutTenantScope(
      'updating a Site, which is the tenant root and therefore not tenant-scoped',
      () => Site.findByIdAndUpdate(access.site._id, { $set: set }, { new: true }),
    );

    await recordAudit({
      action: 'site.settings.changed',
      siteId: access.site._id,
      actorUserId: session.user._id,
      actorRole: access.role,
      targetType: 'Site',
      targetId: siteId,
      before: { modules: access.site.modules },
      after: set,
    });

    return ok({ modules: updated?.modules ?? access.site.modules });
  } catch (error) {
    return toErrorResponse(error);
  }
}

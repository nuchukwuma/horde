/**
 * What a platform admin can do to a store: suspend it, reinstate it, and set
 * or clear the prohibited-products flag. Each blocks or unblocks *checkout*
 * (Site.canAcceptPayments) — never settlement: money a store has already
 * taken is Paystack's to settle and was never ours to hold (ADR-0007).
 *
 * Every action needs a reason and lands in the audit log with the admin who
 * took it, so a seller asking "why was I suspended?" has an answer.
 */

import { Types } from 'mongoose';
import { Site } from '../db/models/Site';
import { ConflictError, NotFoundError } from '../errors';
import { recordAudit } from '../audit';
import { runWithoutTenantScope } from '../tenant/context';

export type ModerationAction = 'suspend' | 'reinstate' | 'flag' | 'unflag';

export interface ModerationInput {
  siteId: string;
  action: ModerationAction;
  reason: string;
  actorUserId: Types.ObjectId;
  ip?: string;
  userAgent?: string;
}

const AUDIT = {
  suspend: 'site.suspended',
  reinstate: 'site.reinstated',
  flag: 'site.prohibited_flag.set',
  unflag: 'site.prohibited_flag.cleared',
} as const;

export async function moderateSite(input: ModerationInput): Promise<{ status: string; prohibitedProductFlag: boolean }> {
  if (!Types.ObjectId.isValid(input.siteId)) throw new NotFoundError('Site');

  return runWithoutTenantScope('platform admin moderating a Site, the tenant root', async () => {
    const site = await Site.findById(input.siteId);
    if (!site) throw new NotFoundError('Site');
    if (site.status === 'closed') throw new ConflictError('This store is closed.');

    const before = { status: site.status, prohibitedProductFlag: site.prohibitedProductFlag };

    if (input.action === 'suspend') site.status = 'suspended';
    if (input.action === 'reinstate') site.status = 'active';
    if (input.action === 'flag') site.prohibitedProductFlag = true;
    if (input.action === 'unflag') site.prohibitedProductFlag = false;
    await site.save();

    const after = { status: site.status, prohibitedProductFlag: site.prohibitedProductFlag };
    await recordAudit({
      action: AUDIT[input.action],
      siteId: site._id,
      actorUserId: input.actorUserId,
      actorRole: 'platform_admin',
      targetType: 'Site',
      targetId: String(site._id),
      before,
      after: { ...after, reason: input.reason },
      ip: input.ip,
      userAgent: input.userAgent,
    });

    return after;
  });
}

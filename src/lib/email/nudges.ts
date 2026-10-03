/**
 * Setup tips: "your store has no products yet", "connect your bank account".
 *
 * SWITCHED OFF unless REENGAGEMENT_EMAILS=on. These are not replies to
 * something the seller just did, so under the NDPA 2023 they may count as
 * direct marketing, which needs a lawful basis and an easy opt-out. Turn them
 * on only once a Nigerian lawyer has confirmed the basis (see .env.example).
 *
 * The rules, each enforced here rather than left to the scheduler:
 *
 *   - Every email carries a one-click unsubscribe, in the footer and as a
 *     List-Unsubscribe header. Without EMAIL_LINK_SECRET, nothing is sent:
 *     an unsubscribe link that cannot work is worse than no email.
 *   - Each tip goes once per store, ever.
 *   - At most one tip per seller every NUDGE_GAP_MS, however many stores they
 *     own.
 *   - Only stores 3–30 days old. A brand-new store needs time; a store left
 *     alone for a month has made its choice.
 *   - Suspended or closed stores and suspended sellers get nothing.
 *   - The connect-your-bank tip waits until the email is confirmed: before
 *     that, the payouts page would only say "confirm your email first", and
 *     the verification reminder (reminders.ts) is already handling that.
 *
 * Claims are atomic, as in reminders.ts: the seller's lastNudgeAt and the
 * store's nudgesSent slot are each set by an update that only matches while
 * still free, so overlapping cron runs cannot double-send.
 */

import type { Types } from 'mongoose';
import { Site, type SiteAttributes } from '../db/models/Site';
import { User } from '../db/models/User';
import { Product } from '../db/models/Product';
import { runWithTenant, runWithoutTenantScope } from '../tenant/context';
import { assertEmailConfigured, sendEmail } from './transport';
import { nudgeEmail, type NudgeKind } from './templates';
import { EmailLinkSecretMissingError, hasEmailLinkSecret, unsubscribeHeaders, unsubscribePageUrl } from './unsubscribe';
import { appOrigin } from '../seo/meta';

type Env = Record<string, string | undefined>;

const DAY = 1000 * 60 * 60 * 24;
export const NUDGE_AFTER_MS = 3 * DAY;
export const NUDGE_WINDOW_MS = 30 * DAY;
export const NUDGE_GAP_MS = 3 * DAY;

const SLOT: Record<NudgeKind, 'noProducts' | 'noPayout'> = {
  no_products: 'noProducts',
  no_payout: 'noPayout',
};

export function nudgesEnabled(env: Env = process.env): boolean {
  return env.REENGAGEMENT_EMAILS === 'on';
}

export interface NudgeResult {
  enabled: boolean;
  considered: number;
  sent: number;
  failed: number;
}

type SiteRow = Pick<SiteAttributes, '_id' | 'name' | 'ownerId' | 'modules' | 'payout' | 'nudgesSent'>;

/** Which tip this store needs now, if any. Products first: it is the earlier step. */
export async function nudgeFor(
  site: SiteRow,
  owner: { emailVerifiedAt?: Date | null },
): Promise<NudgeKind | null> {
  if (!site.modules?.store) return null;

  if (!site.nudgesSent?.noProducts) {
    // Any product counts, drafts included: someone who has started adding
    // products does not need to be told to.
    const hasProduct = await runWithTenant({ siteId: String(site._id) }, () => Product.exists({}));
    if (!hasProduct) return 'no_products';
  }

  if (!site.nudgesSent?.noPayout && site.payout?.status !== 'verified' && owner.emailVerifiedAt) {
    return 'no_payout';
  }

  return null;
}

function actionUrl(kind: NudgeKind, siteId: Types.ObjectId | string, env: Env): string {
  const base = `${appOrigin(env.APP_HOST)}/dashboard/${String(siteId)}`;
  return kind === 'no_products' ? `${base}/products/new` : `${base}/payouts`;
}

export async function sendNudges(
  options: { now?: Date; limit?: number; env?: Env } = {},
): Promise<NudgeResult> {
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  // Most tips sent in one run.
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const result: NudgeResult = { enabled: nudgesEnabled(env), considered: 0, sent: 0, failed: 0 };
  if (!result.enabled) return result;

  if (!hasEmailLinkSecret(env)) throw new EmailLinkSecretMissingError();
  assertEmailConfigured(env);

  const sites = await runWithoutTenantScope(
    'finding stores across all sellers that may be due a setup tip',
    () =>
      Site.find({
        status: 'active',
        'modules.store': true,
        createdAt: { $lte: new Date(now.getTime() - NUDGE_AFTER_MS), $gte: new Date(now.getTime() - NUDGE_WINDOW_MS) },
        $or: [{ 'nudgesSent.noProducts': null }, { 'nudgesSent.noPayout': null }],
      })
        .select('name ownerId modules payout nudgesSent')
        .sort({ createdAt: 1 })
        .lean<SiteRow[]>(),
  );

  // Every store in the window is looked at — the window bounds the scan — and
  // `limit` caps what is SENT. Capping the scan instead would let the oldest
  // stores, which need nothing, crowd out the ones that do.
  for (const site of sites) {
    if (result.sent >= limit) break;
    result.considered += 1;

    const owner = await User.findById(site.ownerId)
      .select('email name status emailVerifiedAt nudgeOptOutAt lastNudgeAt')
      .lean();
    if (!owner || owner.status !== 'active' || owner.nudgeOptOutAt) continue;
    if (owner.lastNudgeAt && now.getTime() - owner.lastNudgeAt.getTime() < NUDGE_GAP_MS) continue;

    const kind = await nudgeFor(site, owner);
    if (!kind) continue;
    const slot = `nudgesSent.${SLOT[kind]}`;

    // Claim the seller's quiet period, then the store's slot.
    const ownerClaim = await User.findOneAndUpdate(
      {
        _id: owner._id,
        nudgeOptOutAt: null,
        $or: [{ lastNudgeAt: null }, { lastNudgeAt: { $lte: new Date(now.getTime() - NUDGE_GAP_MS) } }],
      },
      { $set: { lastNudgeAt: now } },
    );
    if (!ownerClaim) continue;

    const siteClaim = await runWithoutTenantScope('claiming a setup tip slot on a Site, the tenant root', () =>
      Site.findOneAndUpdate({ _id: site._id, [slot]: null }, { $set: { [slot]: now } }),
    );
    if (!siteClaim) {
      await User.updateOne({ _id: owner._id, lastNudgeAt: now }, { $set: { lastNudgeAt: owner.lastNudgeAt ?? null } });
      continue;
    }

    try {
      await sendEmail(
        {
          to: owner.email,
          ...nudgeEmail({
            kind,
            name: owner.name,
            storeName: site.name,
            actionUrl: actionUrl(kind, site._id, env),
            unsubscribeUrl: unsubscribePageUrl(String(owner._id), env),
          }),
          headers: unsubscribeHeaders(String(owner._id), env),
        },
        env,
      );
      result.sent += 1;
    } catch {
      result.failed += 1;
      // Release both claims so the next run can try again.
      await runWithoutTenantScope('releasing a setup tip slot after a failed send', () =>
        Site.updateOne({ _id: site._id, [slot]: now }, { $set: { [slot]: null } }),
      );
      await User.updateOne({ _id: owner._id, lastNudgeAt: now }, { $set: { lastNudgeAt: owner.lastNudgeAt ?? null } });
      console.error('[email] setup tip failed', String(site._id), kind);
    }
  }

  return result;
}

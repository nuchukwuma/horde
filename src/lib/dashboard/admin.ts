/**
 * Platform admin data.
 *
 * Every function here reads across tenants, which is the one legitimate reason
 * to bypass tenant scope. Each bypass carries its reason and is greppable:
 *
 *   grep -rn runWithoutTenantScope src/
 *
 * Nothing in this module may be reachable from a seller-facing route. The
 * `assertPlatformAdmin` guard on each /api/admin route is what enforces that.
 */

import { Types } from 'mongoose';
import { LedgerEntry } from '../db/models/LedgerEntry';
import { Order } from '../db/models/Order';
import { Site } from '../db/models/Site';
import { User } from '../db/models/User';
import { AuditLog } from '../db/models/AuditLog';
import { WebhookEvent } from '../db/models/WebhookEvent';
import { platformTotals, type PlatformTotals, type TotalsFilter } from '../ledger/balances';
import { runWithoutTenantScope } from '../tenant/context';

export interface AdminOverview extends PlatformTotals {
  activeSites: number;
  suspendedSites: number;
  sitesAwaitingPayoutVerification: number;
  flaggedSites: number;
  openDisputes: number;
  failedWebhooks: number;
}

export async function adminOverview(filter: TotalsFilter = {}): Promise<AdminOverview> {
  const totals = await platformTotals(filter);

  const counts = await runWithoutTenantScope(
    'platform admin overview, which counts across every tenant by definition',
    async () => {
      const [
        activeSites,
        suspendedSites,
        sitesAwaitingPayoutVerification,
        flaggedSites,
        openDisputes,
        failedWebhooks,
      ] = await Promise.all([
        Site.countDocuments({ status: 'active' }),
        Site.countDocuments({ status: 'suspended' }),
        Site.countDocuments({ 'payout.status': { $ne: 'verified' } }),
        Site.countDocuments({ prohibitedProductFlag: true }),
        Order.countDocuments({ status: 'disputed' }),
        WebhookEvent.countDocuments({ status: 'failed' }),
      ]);

      return {
        activeSites,
        suspendedSites,
        sitesAwaitingPayoutVerification,
        flaggedSites,
        openDisputes,
        failedWebhooks,
      };
    },
  );

  return { ...totals, ...counts };
}

export interface SellerVolumeRow {
  siteId: string;
  slug: string;
  name: string;
  planCode: string;
  status: string;
  payoutStatus: string;
  prohibitedProductFlag: boolean;
  grossKobo: number;
  platformCommissionKobo: number;
  sellerNetKobo: number;
  saleCount: number;
  refundCount: number;
}

/**
 * Volume per seller, biggest first.
 *
 * Aggregates the ledger and joins Site for the labels, rather than looping over
 * sites and querying each — that would be one query per seller on a page that
 * gets slower exactly as the business succeeds.
 */
export async function sellerVolume(
  filter: TotalsFilter & { limit?: number } = {},
): Promise<SellerVolumeRow[]> {
  const limit = Math.min(filter.limit ?? 50, 200);

  const match: Record<string, unknown> = {};
  if (filter.from || filter.to) {
    const createdAt: Record<string, Date> = {};
    if (filter.from) createdAt.$gte = filter.from;
    if (filter.to) createdAt.$lte = filter.to;
    match.createdAt = createdAt;
  }

  return runWithoutTenantScope(
    'platform admin per-seller volume report, which spans every tenant',
    async () => {
      const rows = await LedgerEntry.aggregate<SellerVolumeRow>([
        { $match: match },
        {
          $group: {
            _id: '$siteId',
            grossKobo: { $sum: '$grossKobo' },
            platformCommissionKobo: { $sum: '$platformCommissionKobo' },
            sellerNetKobo: { $sum: '$sellerNetKobo' },
            saleCount: { $sum: { $cond: [{ $eq: ['$entryType', 'sale'] }, 1, 0] } },
            refundCount: { $sum: { $cond: [{ $eq: ['$entryType', 'refund'] }, 1, 0] } },
          },
        },
        { $sort: { grossKobo: -1 } },
        { $limit: limit },
        { $lookup: { from: 'sites', localField: '_id', foreignField: '_id', as: 'site' } },
        { $unwind: { path: '$site', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 0,
            siteId: { $toString: '$_id' },
            slug: { $ifNull: ['$site.slug', '(deleted)'] },
            name: { $ifNull: ['$site.name', '(deleted)'] },
            planCode: { $ifNull: ['$site.planCode', 'unknown'] },
            status: { $ifNull: ['$site.status', 'unknown'] },
            payoutStatus: { $ifNull: ['$site.payout.status', 'unknown'] },
            prohibitedProductFlag: { $ifNull: ['$site.prohibitedProductFlag', false] },
            grossKobo: 1,
            platformCommissionKobo: 1,
            sellerNetKobo: 1,
            saleCount: 1,
            refundCount: 1,
          },
        },
      ]);

      return rows;
    },
  );
}

export type FlagReason =
  | 'amount_mismatch'
  | 'open_dispute'
  | 'failed_webhook'
  | 'prohibited_products'
  | 'stuck_pending';

export interface FlaggedItem {
  reason: FlagReason;
  severity: 'high' | 'medium';
  siteId: string | null;
  reference: string | null;
  orderId: string | null;
  detectedAt: Date;
  detail: string;
}

/**
 * Things a human should look at.
 *
 * Severity is about money at risk, not volume:
 *
 *   high   — money may be wrong or missing: an amount that disagreed with the
 *            order, a webhook that never processed, an order stuck pending
 *            after a customer may have paid.
 *   medium — needs a decision but nothing is silently wrong: an open dispute,
 *            a site flagged for prohibited products.
 */
export async function flaggedTransactions(
  options: { limit?: number; stuckPendingMinutes?: number } = {},
): Promise<FlaggedItem[]> {
  const limit = Math.min(options.limit ?? 100, 500);
  const stuckAfter = new Date(Date.now() - (options.stuckPendingMinutes ?? 60) * 60_000);

  return runWithoutTenantScope(
    'platform admin risk review, which must see every tenant to be useful',
    async () => {
      const [mismatches, disputes, failedWebhooks, prohibited, stuckPending] = await Promise.all([
        AuditLog.find({ action: 'webhook.amount_mismatch' })
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean(),
        Order.find({ status: 'disputed' }).sort({ updatedAt: -1 }).limit(limit).lean(),
        WebhookEvent.find({ status: 'failed' }).sort({ receivedAt: -1 }).limit(limit).lean(),
        Site.find({ prohibitedProductFlag: true }).limit(limit).lean(),
        // A pending order with a Paystack reference and no resolution is the
        // shape of "customer paid, webhook never landed".
        Order.find({
          status: 'pending',
          'paystack.reference': { $exists: true },
          createdAt: { $lt: stuckAfter },
        })
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean(),
      ]);

      const items: FlaggedItem[] = [];

      for (const log of mismatches) {
        items.push({
          reason: 'amount_mismatch',
          severity: 'high',
          siteId: log.siteId ? String(log.siteId) : null,
          reference: (log.after as { reference?: string } | null)?.reference ?? null,
          orderId: log.targetId ?? null,
          detectedAt: log.createdAt,
          detail: 'Paystack reported an amount or currency that disagreed with the order.',
        });
      }

      for (const event of failedWebhooks) {
        items.push({
          reason: 'failed_webhook',
          severity: 'high',
          siteId: event.siteId ? String(event.siteId) : null,
          reference: event.reference ?? null,
          orderId: event.orderId ? String(event.orderId) : null,
          detectedAt: event.receivedAt,
          detail: `${event.eventType} failed after ${event.attempts} attempt(s): ${
            event.lastError ?? 'no error recorded'
          }`,
        });
      }

      for (const order of stuckPending) {
        items.push({
          reason: 'stuck_pending',
          severity: 'high',
          siteId: String(order.siteId),
          reference: order.paystack?.reference ?? null,
          orderId: String(order._id),
          detectedAt: order.createdAt,
          detail:
            'Checkout was initialised but never confirmed. If the customer paid, ' +
            'the webhook did not arrive — verify against Paystack.',
        });
      }

      for (const order of disputes) {
        items.push({
          reason: 'open_dispute',
          severity: 'medium',
          siteId: String(order.siteId),
          reference: order.paystack?.reference ?? null,
          orderId: String(order._id),
          detectedAt: order.updatedAt,
          detail: 'Customer disputed this charge with their bank.',
        });
      }

      for (const site of prohibited) {
        items.push({
          reason: 'prohibited_products',
          severity: 'medium',
          siteId: String(site._id as Types.ObjectId),
          reference: null,
          orderId: null,
          detectedAt: site.updatedAt,
          detail: `Site "${site.slug}" is flagged for prohibited products and cannot take payments.`,
        });
      }

      // High severity first, then most recent. An admin reads from the top.
      return items
        .sort((a, b) => {
          if (a.severity !== b.severity) return a.severity === 'high' ? -1 : 1;
          return b.detectedAt.getTime() - a.detectedAt.getTime();
        })
        .slice(0, limit);
    },
  );
}

export interface StoreRow extends SellerVolumeRow {
  ownerEmail: string | null;
  createdAt: Date | null;
}

/**
 * Every store, newest first, with its sales beside it — including stores that
 * have not sold anything yet, which sellerVolume (built from the ledger)
 * cannot see. Those are exactly the ones an admin checks during onboarding.
 */
export async function storesWithVolume(limit = 200): Promise<StoreRow[]> {
  const capped = Math.min(Math.max(limit, 1), 500);
  const [volume, sites] = await Promise.all([
    sellerVolume({ limit: 200 }),
    runWithoutTenantScope('platform admin store list, which spans every tenant', () =>
      Site.find({}).sort({ createdAt: -1 }).limit(capped).lean(),
    ),
  ]);
  const owners = await runWithoutTenantScope('platform admin store list: owner emails', () =>
    User.find({ _id: { $in: sites.map((site) => site.ownerId) } })
      .select('email')
      .lean(),
  );
  const emailById = new Map(owners.map((owner) => [String(owner._id), owner.email]));
  const volumeById = new Map(volume.map((row) => [row.siteId, row]));

  return sites.map((site) => {
    const sold = volumeById.get(String(site._id));
    return {
      siteId: String(site._id),
      slug: site.slug,
      name: site.name,
      planCode: site.planCode,
      status: site.status,
      payoutStatus: site.payout?.status ?? 'unset',
      prohibitedProductFlag: Boolean(site.prohibitedProductFlag),
      grossKobo: sold?.grossKobo ?? 0,
      platformCommissionKobo: sold?.platformCommissionKobo ?? 0,
      sellerNetKobo: sold?.sellerNetKobo ?? 0,
      saleCount: sold?.saleCount ?? 0,
      refundCount: sold?.refundCount ?? 0,
      ownerEmail: emailById.get(String(site.ownerId)) ?? null,
      createdAt: site.createdAt ?? null,
    };
  });
}

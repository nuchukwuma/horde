/**
 * Ledger reads.
 *
 * Because entries are signed and append-only, every figure here is a plain sum
 * over rows. There is no "current balance" column that could drift from the
 * entries that produced it.
 *
 * All queries run inside tenant scope, so a seller's totals cannot include
 * another seller's rows.
 */

import { Types } from 'mongoose';
import { LedgerEntry } from '../db/models/LedgerEntry';
import { runWithoutTenantScope } from '../tenant/context';

export interface SellerTotals {
  /** Sum of sale gross, less refunds. */
  grossKobo: number;
  /** Paystack's fees on those sales. */
  providerFeeKobo: number;
  /** What the platform took, net of commission returned on refunds. */
  platformCommissionKobo: number;
  platformCommissionVatKobo: number;
  /** What the seller earned, net of refunds. */
  sellerNetKobo: number;
  /** Seller net on entries not yet settled. */
  pendingKobo: number;
  /** Seller net on entries Paystack has settled. */
  settledKobo: number;
  orderCount: number;
  refundCount: number;
}

const ZERO_TOTALS: SellerTotals = {
  grossKobo: 0,
  providerFeeKobo: 0,
  platformCommissionKobo: 0,
  platformCommissionVatKobo: 0,
  sellerNetKobo: 0,
  pendingKobo: 0,
  settledKobo: 0,
  orderCount: 0,
  refundCount: 0,
};

export interface TotalsFilter {
  from?: Date;
  to?: Date;
}

function dateMatch(filter: TotalsFilter): Record<string, unknown> {
  if (!filter.from && !filter.to) return {};
  const createdAt: Record<string, Date> = {};
  if (filter.from) createdAt.$gte = filter.from;
  if (filter.to) createdAt.$lte = filter.to;
  return { createdAt };
}

/**
 * Totals for the tenant currently in scope.
 *
 * Must be called inside runWithTenant — the aggregate is scoped by the plugin.
 */
export async function sellerTotals(filter: TotalsFilter = {}): Promise<SellerTotals> {
  const [result] = await LedgerEntry.aggregate<SellerTotals & { _id: null }>([
    { $match: dateMatch(filter) },
    {
      $group: {
        _id: null,
        grossKobo: { $sum: '$grossKobo' },
        providerFeeKobo: { $sum: '$providerFeeKobo' },
        platformCommissionKobo: { $sum: '$platformCommissionKobo' },
        platformCommissionVatKobo: { $sum: '$platformCommissionVatKobo' },
        sellerNetKobo: { $sum: '$sellerNetKobo' },
        pendingKobo: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$sellerNetKobo', 0] },
        },
        settledKobo: {
          $sum: { $cond: [{ $eq: ['$status', 'settled'] }, '$sellerNetKobo', 0] },
        },
        orderCount: { $sum: { $cond: [{ $eq: ['$entryType', 'sale'] }, 1, 0] } },
        refundCount: { $sum: { $cond: [{ $eq: ['$entryType', 'refund'] }, 1, 0] } },
      },
    },
  ]);

  if (!result) return { ...ZERO_TOTALS };

  const { _id, ...totals } = result;
  void _id;
  return totals;
}

/** Every entry for one order, oldest first: the full story of that sale. */
export async function orderLedger(orderId: Types.ObjectId | string) {
  return LedgerEntry.find({ orderId }).sort({ createdAt: 1 }).lean();
}

/**
 * How much has already been refunded against an order.
 *
 * Refund gross is stored negative, so this negates the sum to give a positive
 * amount the refund policy can subtract from the refundable balance.
 */
export async function refundedTotalForOrder(orderId: Types.ObjectId | string): Promise<number> {
  const [result] = await LedgerEntry.aggregate<{ total: number }>([
    { $match: { orderId: new Types.ObjectId(String(orderId)), entryType: 'refund' } },
    { $group: { _id: null, total: { $sum: '$grossKobo' } } },
  ]);

  return result ? Math.abs(result.total) : 0;
}

export interface PlatformTotals {
  grossKobo: number;
  platformCommissionKobo: number;
  platformCommissionVatKobo: number;
  providerFeeKobo: number;
  siteCount: number;
}

/**
 * Platform-wide totals across every seller.
 *
 * Deliberately cross-tenant, for the admin panel only. Never reachable from a
 * seller-facing route.
 */
export async function platformTotals(filter: TotalsFilter = {}): Promise<PlatformTotals> {
  return runWithoutTenantScope(
    'platform admin revenue reporting, which spans every tenant by definition',
    async () => {
      const [result] = await LedgerEntry.aggregate<PlatformTotals & { _id: null }>([
        { $match: dateMatch(filter) },
        {
          $group: {
            _id: null,
            grossKobo: { $sum: '$grossKobo' },
            platformCommissionKobo: { $sum: '$platformCommissionKobo' },
            platformCommissionVatKobo: { $sum: '$platformCommissionVatKobo' },
            providerFeeKobo: { $sum: '$providerFeeKobo' },
            sites: { $addToSet: '$siteId' },
          },
        },
        {
          $project: {
            grossKobo: 1,
            platformCommissionKobo: 1,
            platformCommissionVatKobo: 1,
            providerFeeKobo: 1,
            siteCount: { $size: '$sites' },
          },
        },
      ]);

      if (!result) {
        return {
          grossKobo: 0,
          platformCommissionKobo: 0,
          platformCommissionVatKobo: 0,
          providerFeeKobo: 0,
          siteCount: 0,
        };
      }

      const { _id, ...totals } = result;
      void _id;
      return totals;
    },
  );
}

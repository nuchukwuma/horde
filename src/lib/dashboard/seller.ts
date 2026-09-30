/**
 * Seller dashboard data.
 *
 * Everything here runs inside tenant scope, so a seller's figures cannot
 * include another seller's rows — that is the plugin's job, not this module's,
 * and there is no siteId filter written by hand anywhere below.
 *
 * Amounts stay integer kobo all the way to the response. Formatting for display
 * is the UI's problem; a number that has been through a currency formatter is
 * no longer a number you can add up.
 */

import { Types } from 'mongoose';
import { LedgerEntry, type LedgerEntryType } from '../db/models/LedgerEntry';
import { Order } from '../db/models/Order';
import { sellerTotals, type SellerTotals, type TotalsFilter } from '../ledger/balances';

export interface DashboardSummary extends SellerTotals {
  /** Orders taken but not yet confirmed paid. */
  pendingOrderCount: number;
  disputedOrderCount: number;
  /** True while settlement reporting is unverified — see the webhook handler. */
  settlementDataIsProvisional: boolean;
}

export async function dashboardSummary(filter: TotalsFilter = {}): Promise<DashboardSummary> {
  const [totals, pendingOrderCount, disputedOrderCount] = await Promise.all([
    sellerTotals(filter),
    Order.countDocuments({ status: 'pending' }),
    Order.countDocuments({ status: 'disputed' }),
  ]);

  return {
    ...totals,
    pendingOrderCount,
    disputedOrderCount,
    // Honest flag rather than a number the seller would take as settled fact.
    settlementDataIsProvisional: true,
  };
}

export interface TransactionRow {
  id: string;
  createdAt: Date;
  entryType: LedgerEntryType;
  status: string;
  orderId: string | null;
  orderNumber: string | null;
  customerEmail: string | null;
  reference: string | null;
  grossKobo: number;
  providerFeeKobo: number;
  platformCommissionKobo: number;
  platformCommissionVatKobo: number;
  sellerNetKobo: number;
  memo: string | null;
}

export interface TransactionQuery extends TotalsFilter {
  entryType?: LedgerEntryType;
  /** Opaque cursor from a previous page. */
  cursor?: string;
  limit?: number;
}

export interface TransactionPage {
  rows: TransactionRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Cursor-based, not offset-based.
 *
 * A ledger gains rows constantly, and with OFFSET a row inserted between page
 * loads shifts everything down — the seller sees a transaction twice or never.
 * Duplicated or missing rows in a financial list destroy trust in the whole
 * figure, so the cursor is worth the extra complexity.
 *
 * The cursor is (createdAt, _id): createdAt alone is not unique, and two
 * entries written in the same millisecond would straddle a page boundary.
 */
export async function listTransactions(query: TransactionQuery = {}): Promise<TransactionPage> {
  const limit = Math.min(Math.max(query.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  const filter: Record<string, unknown> = {};
  if (query.entryType) filter.entryType = query.entryType;

  const createdAt: Record<string, Date> = {};
  if (query.from) createdAt.$gte = query.from;
  if (query.to) createdAt.$lte = query.to;
  if (Object.keys(createdAt).length > 0) filter.createdAt = createdAt;

  const decoded = query.cursor ? decodeCursor(query.cursor) : null;
  if (decoded) {
    // Newest first, so "after this cursor" means older than it.
    filter.$or = [
      { createdAt: { $lt: decoded.createdAt } },
      { createdAt: decoded.createdAt, _id: { $lt: decoded.id } },
    ];
  }

  // One extra row tells us whether another page exists without a second query.
  const entries = await LedgerEntry.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean();

  const hasMore = entries.length > limit;
  const page = hasMore ? entries.slice(0, limit) : entries;

  const orders = await loadOrders(page.map((entry) => entry.orderId).filter(Boolean));

  const rows: TransactionRow[] = page.map((entry) => {
    const order = entry.orderId ? orders.get(String(entry.orderId)) : undefined;

    return {
      id: String(entry._id),
      createdAt: entry.createdAt,
      entryType: entry.entryType,
      status: entry.status,
      orderId: entry.orderId ? String(entry.orderId) : null,
      orderNumber: order?.orderNumber ?? null,
      customerEmail: order?.customerEmail ?? null,
      reference: entry.paystack?.reference ?? null,
      grossKobo: entry.grossKobo,
      providerFeeKobo: entry.providerFeeKobo,
      platformCommissionKobo: entry.platformCommissionKobo,
      platformCommissionVatKobo: entry.platformCommissionVatKobo,
      sellerNetKobo: entry.sellerNetKobo,
      memo: entry.memo ?? null,
    };
  });

  const last = page.at(-1);
  const nextCursor =
    hasMore && last
      ? encodeCursor({ createdAt: last.createdAt, id: last._id })
      : null;

  return { rows, nextCursor, hasMore };
}

/** Batch the order lookup; one query per row would be an N+1 on every page. */
async function loadOrders(orderIds: (Types.ObjectId | null | undefined)[]) {
  const ids = orderIds.filter(Boolean) as Types.ObjectId[];
  if (ids.length === 0) return new Map<string, { orderNumber: string; customerEmail: string }>();

  const orders = await Order.find({ _id: { $in: ids } })
    .select('orderNumber customerEmail')
    .lean();

  return new Map(
    orders.map((order) => [
      String(order._id),
      { orderNumber: order.orderNumber, customerEmail: order.customerEmail },
    ]),
  );
}

interface Cursor {
  createdAt: Date;
  id: Types.ObjectId;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(`${cursor.createdAt.toISOString()}|${cursor.id}`).toString('base64url');
}

/**
 * Decode a cursor, returning null on anything malformed.
 *
 * A bad cursor is a first page, not a 500. Cursors end up in URLs that get
 * truncated, shared and edited, and none of that should produce an error page.
 */
export function decodeCursor(raw: string): Cursor | null {
  try {
    const [timestamp, id] = Buffer.from(raw, 'base64url').toString('utf8').split('|');
    if (!timestamp || !id || !/^[a-f0-9]{24}$/i.test(id)) return null;

    const createdAt = new Date(timestamp);
    if (Number.isNaN(createdAt.getTime())) return null;

    return { createdAt, id: new Types.ObjectId(id) };
  } catch {
    return null;
  }
}

/**
 * Sales to MrMouse, delivered until confirmed.
 *
 * A paid order is written to MrMouseSaleDelivery first, then sent. Anything
 * not confirmed with a 2xx is retried with growing gaps (about two days in
 * all), and is then marked failed for the seller to see. Retries run:
 *   - after every new sale and every stock message from that store,
 *   - from GET/POST /api/cron/mrmouse-sales (Bearer CRON_SECRET),
 *   - from `npm run mrmouse:retry` on any scheduler.
 *
 * MrMouse de-duplicates on (siteId, orderNumber), so sending a message twice
 * is safe; losing one is what this file prevents.
 */

import type { Types } from 'mongoose';
import { MrMouseSaleDelivery, type MrMouseSaleDeliveryAttributes, type MrMouseSaleItem } from '../db/models/MrMouseSaleDelivery';
import { runWithTenant, runWithoutTenantScope } from '../tenant/context';
import { canSync, mrmouseConfig, signBody, type MrMouseConfig } from './mrmouse';

/** Gap before retry n (1-based). After the last, the sale is marked failed. */
export const RETRY_DELAYS_MS = [
  60_000, // 1 minute
  5 * 60_000,
  15 * 60_000,
  60 * 60_000,
  3 * 60 * 60_000,
  6 * 60 * 60_000,
  12 * 60 * 60_000,
  24 * 60 * 60_000,
] as const;

const SEND_TIMEOUT_MS = 5_000;
const LOCK_MS = 60_000;

type Fetch = typeof fetch;

export interface DeliveryOptions {
  config?: MrMouseConfig;
  fetchImpl?: Fetch;
  now?: Date;
}

type DeliveryRow = Pick<MrMouseSaleDeliveryAttributes, '_id' | 'siteId' | 'orderNumber' | 'body' | 'attempts'>;

const tenantOf = (siteId: Types.ObjectId | string) => ({ siteId: String(siteId) });

/** Record the sale, then try to send it at once. Never throws. */
export async function queueMrMouseSale(
  sale: { siteId: Types.ObjectId; orderId: Types.ObjectId; orderNumber: string; paidAt: Date; items: MrMouseSaleItem[] },
  options: DeliveryOptions = {},
): Promise<void> {
  const config = options.config ?? mrmouseConfig();
  if (!canSync(config) || sale.items.length === 0) return;
  try {
    const body = JSON.stringify({
      event: 'order.paid',
      siteId: String(sale.siteId),
      orderNumber: sale.orderNumber,
      paidAt: sale.paidAt.toISOString(),
      items: sale.items,
    });
    await runWithTenant(tenantOf(sale.siteId), async () => {
      try {
        await MrMouseSaleDelivery.create({
          siteId: sale.siteId,
          orderId: sale.orderId,
          orderNumber: sale.orderNumber,
          items: sale.items,
          body,
          nextAttemptAt: options.now ?? new Date(),
        });
      } catch (error) {
        // Already queued by an earlier delivery of the same webhook.
        if ((error as { code?: number }).code !== 11000) throw error;
      }
    });
    await retryDueMrMouseSales({ ...options, config, siteId: sale.siteId });
  } catch (error) {
    console.error('[mrmouse] could not queue sale', sale.orderNumber, (error as Error)?.name);
  }
}

/** One attempt. Returns true when MrMouse confirmed it. */
async function attempt(row: DeliveryRow, config: MrMouseConfig, fetchImpl: Fetch, now: Date): Promise<boolean> {
  let status = 0;
  try {
    const response = await fetchImpl(`${config.apiUrl}/integrations/hordemart/sales`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-HordeMart-Signature': signBody(row.body, config.webhookSecret as string, now.getTime()),
      },
      body: row.body,
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    status = response.status;
  } catch {
    status = 0; // unreachable or timed out
  }

  const delivered = status >= 200 && status < 300;
  // The row is claimed (lockedUntil), so its attempt count cannot move under us.
  const attempts = row.attempts + 1;
  const delay = RETRY_DELAYS_MS[attempts - 1];
  await runWithTenant(tenantOf(row.siteId), async () => {
    await MrMouseSaleDelivery.updateOne(
      { _id: row._id },
      {
        $set: delivered
          ? { status: 'delivered', deliveredAt: now, nextAttemptAt: null, lockedUntil: null, lastStatus: status, attempts }
          : delay === undefined
            ? { status: 'failed', nextAttemptAt: null, lockedUntil: null, lastStatus: status, attempts }
            : { nextAttemptAt: new Date(now.getTime() + delay), lockedUntil: null, lastStatus: status, attempts },
      },
    );
  });
  if (!delivered) console.error('[mrmouse] sale not confirmed', row.orderNumber, status || 'unreachable');
  return delivered;
}

/**
 * Send every sale that is due — for one store, or for all of them. Each row
 * is claimed first, so overlapping runs never send the same one together.
 */
export async function retryDueMrMouseSales(
  options: DeliveryOptions & { siteId?: Types.ObjectId | string; limit?: number } = {},
): Promise<{ attempted: number; delivered: number }> {
  const config = options.config ?? mrmouseConfig();
  if (!canSync(config)) return { attempted: 0, delivered: 0 };
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? new Date();
  const limit = options.limit ?? 50;

  const due = {
    status: 'pending',
    nextAttemptAt: { $lte: now },
    $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }],
  };

  let attempted = 0;
  let delivered = 0;
  for (; attempted < limit; attempted++) {
    const claim = { $set: { lockedUntil: new Date(now.getTime() + LOCK_MS) } };
    const row = (options.siteId
      ? await runWithTenant(tenantOf(options.siteId), () =>
          MrMouseSaleDelivery.findOneAndUpdate(due, claim, { new: true, sort: { nextAttemptAt: 1 } }).lean(),
        )
      : await runWithoutTenantScope('retrying undelivered MrMouse sale messages for every store', () =>
          MrMouseSaleDelivery.findOneAndUpdate(due, claim, { new: true, sort: { nextAttemptAt: 1 } }).lean(),
        )) as DeliveryRow | null;
    if (!row) break;
    if (await attempt(row, config, fetchImpl, now)) delivered++;
  }
  return { attempted, delivered };
}

/**
 * Units of each SKU sold here that MrMouse's count, as of `sentAt`, cannot
 * include yet: not delivered, or delivered after MrMouse took its count.
 * Call inside the store's tenant scope.
 */
export async function salesMrMouseHasNotCounted(sentAt: Date): Promise<Map<string, number>> {
  const rows = await MrMouseSaleDelivery.find({
    $or: [{ status: { $in: ['pending', 'failed'] } }, { status: 'delivered', deliveredAt: { $gt: sentAt } }],
  })
    .select('items')
    .lean();
  const totals = new Map<string, number>();
  for (const row of rows) {
    for (const item of row.items) totals.set(item.sku, (totals.get(item.sku) ?? 0) + item.quantity);
  }
  return totals;
}

/** For the dashboard: sales still on their way, and those that gave up. */
export async function mrmouseSaleBacklog(siteId: Types.ObjectId | string) {
  return runWithTenant(tenantOf(siteId), async () => {
    const [pending, failed] = await Promise.all([
      MrMouseSaleDelivery.countDocuments({ status: 'pending' }),
      MrMouseSaleDelivery.find({ status: 'failed' }).select('orderNumber').sort({ createdAt: 1 }).limit(20).lean(),
    ]);
    return { pending, failed: failed.length, failedOrders: failed.map((row) => row.orderNumber) };
  });
}

/** The seller pressed "Try again": failed sales get a fresh round of retries. */
export async function retryFailedMrMouseSales(siteId: Types.ObjectId | string, options: DeliveryOptions = {}) {
  const now = options.now ?? new Date();
  await runWithTenant(tenantOf(siteId), () =>
    MrMouseSaleDelivery.updateMany(
      { status: 'failed' },
      { $set: { status: 'pending', attempts: 0, nextAttemptAt: now, lockedUntil: null } },
    ),
  );
  return retryDueMrMouseSales({ ...options, now, siteId });
}

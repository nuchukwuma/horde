/**
 * Paystack webhook processing.
 *
 * Order of operations matters, and this is the order:
 *
 *   1. Verify the signature over the raw body. Nothing is recorded before this,
 *      so an unsigned request cannot fill our database.
 *   2. Claim the event atomically. A unique index makes Paystack's retries safe.
 *   3. For a charge, ask Paystack what happened via the verify endpoint. The
 *      webhook body says an amount; we do not believe it. Only the verify
 *      response, matched against the order we created, marks anything paid.
 *
 * The handler always answers 200 once the signature checks out, EXCEPT on a
 * transient failure, where a 500 asks Paystack to redeliver. A permanent
 * problem (amount mismatch, unknown order) returns 200: retrying will not fix
 * it, and a webhook Paystack retries forever is noise that hides real failures.
 */

import { createHash } from 'node:crypto';
import { WebhookEvent } from '../db/models/WebhookEvent';
import { Order, type OrderAttributes, type OrderStatus } from '../db/models/Order';
import { LedgerEntry } from '../db/models/LedgerEntry';
import { Product } from '../db/models/Product';
import { Types } from 'mongoose';
import { verifyPaystackSignature } from '../paystack/webhookSignature';
import { verifyTransaction } from '../paystack/transactions';
import type { PaystackCallOptions } from '../paystack/accounts';
import {
  classifyEvent,
  deriveEventId,
  extractReference,
  parsePaystackEvent,
  type EventKind,
  type PaystackEvent,
} from './paystackEvent';
import { runWithTenant, runWithoutTenantScope } from '../tenant/context';
import { recordAudit } from '../audit';
import { notifyOrderPaid } from '../orders/notifications';
import { recordRefund, recordSettlement } from '../ledger/entries';
import { refundedTotalForOrder } from '../ledger/balances';
import { computeRefundSplit, readRefundPolicy } from '../payments/refundPolicy';
import {
  confirmPremiumPayment,
  handleSubscriptionChange,
  handleSubscriptionCreated,
  isSubscriptionReference,
} from '../billing/subscription';

export type ProcessOutcome =
  | 'invalid_signature'
  | 'malformed'
  | 'duplicate'
  | 'processed'
  | 'ignored'
  | 'order_not_found'
  | 'amount_mismatch'
  | 'failed';

export interface ProcessResult {
  outcome: ProcessOutcome;
  httpStatus: number;
  eventId?: string;
}

export interface ProcessInput {
  rawBody: string;
  signature: string | null;
  secretKey?: string;
}

export async function processPaystackEvent(
  input: ProcessInput,
  options: PaystackCallOptions = {},
): Promise<ProcessResult> {
  if (!verifyPaystackSignature(input.rawBody, input.signature, input.secretKey)) {
    // Nothing is written. An unauthenticated caller must not be able to create
    // rows in our database by POSTing garbage.
    return { outcome: 'invalid_signature', httpStatus: 401 };
  }

  let event: PaystackEvent;
  try {
    event = parsePaystackEvent(input.rawBody);
  } catch {
    // Correctly signed but unparseable means Paystack changed shape. A retry
    // will not help, so accept it and let the log surface it.
    return { outcome: 'malformed', httpStatus: 200 };
  }

  const eventId = deriveEventId(event);
  const kind = classifyEvent(event.event);

  const claim = await claimEvent(event, eventId, input.rawBody);
  if (claim === 'already_processed') {
    return { outcome: 'duplicate', httpStatus: 200, eventId };
  }

  try {
    const outcome = await handleEvent(kind, event, eventId, options);
    await finishEvent(eventId, outcome);
    return { outcome, httpStatus: 200, eventId };
  } catch (error) {
    await finishEvent(eventId, 'failed', error);
    // Transient: ask Paystack to redeliver.
    return { outcome: 'failed', httpStatus: 500, eventId };
  }
}

/**
 * Take ownership of an event.
 *
 * The unique index on (provider, eventId) makes concurrent redeliveries safe:
 * one upsert wins, the rest see the existing row. Status, not existence, decides
 * whether to process — a row left in `processing` by a crashed run must be
 * retried, not skipped forever.
 */
async function claimEvent(
  event: PaystackEvent,
  eventId: string,
  rawBody: string,
): Promise<'claimed' | 'already_processed'> {
  // `status: { $ne: 'processed' }` is the whole idempotency guarantee.
  //
  // An earlier version matched on (provider, eventId) alone and unconditionally
  // set status to 'processing', deciding duplicate-ness from the pre-image. That
  // is wrong in two compounding ways, and the integration suite caught it the
  // first time it ever ran:
  //
  //   - a redelivery of a processed event rewrote its status to 'processing'
  //     and returned duplicate without ever finishing it, so the row stayed
  //     'processing' forever — indistinguishable from a genuinely crashed run
  //   - the NEXT redelivery then saw 'processing', not 'processed', claimed it,
  //     and RE-RAN THE HANDLER. Every second retry double-processed.
  //
  // Money survived that only because handleChargeSuccess bails on an already
  // paid order. Idempotency was being provided by a downstream guard rather
  // than by the mechanism whose entire job it is.
  //
  // With the filter, a processed row no longer matches, so the upsert attempts
  // an insert and the unique (provider, eventId) index rejects it. That
  // rejection IS the "already processed" signal, and it is atomic — no
  // read-then-write window for a concurrent redelivery to slip through.
  //
  // A row left in 'processing' by a crashed run still matches, so it is still
  // retried rather than skipped forever.
  try {
    await runWithoutTenantScope(
      'recording an inbound webhook, which arrives before any tenant is known',
      () =>
        WebhookEvent.findOneAndUpdate(
          { provider: 'paystack', eventId, status: { $ne: 'processed' } },
          {
            $setOnInsert: {
              provider: 'paystack',
              eventId,
              eventType: event.event,
              reference: extractReference(event),
              signatureVerified: true,
              // The digest only, never the body: a charge payload carries
              // cardholder detail we have no reason to retain.
              rawBodySha256: createHash('sha256').update(rawBody).digest('hex'),
              receivedAt: new Date(),
            },
            $set: { status: 'processing' },
            $inc: { attempts: 1 },
          },
          { upsert: true, new: false },
        ),
    );

    // Inserted, or took over a row that was not yet processed. Either way this
    // call owns the event.
    return 'claimed';
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      // A processed row exists. Count the redelivery so the record shows how
      // many times Paystack sent it, but do not touch status.
      await runWithoutTenantScope(
        'counting a redelivery of an already-processed webhook',
        () =>
          WebhookEvent.updateOne(
            { provider: 'paystack', eventId },
            { $inc: { attempts: 1 } },
          ),
      );
      return 'already_processed';
    }
    throw error;
  }
}

/** Mongo's duplicate-key code. */
function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

async function finishEvent(
  eventId: string,
  outcome: ProcessOutcome,
  error?: unknown,
): Promise<void> {
  const status =
    outcome === 'failed' ? 'failed' : outcome === 'ignored' ? 'ignored' : 'processed';

  await runWithoutTenantScope('updating an inbound webhook record, which has no tenant', () =>
    WebhookEvent.updateOne(
      { provider: 'paystack', eventId },
      {
        $set: {
          status,
          processedAt: new Date(),
          lastError: error instanceof Error ? error.message.slice(0, 2_000) : null,
        },
      },
    ),
  );
}

async function handleEvent(
  kind: EventKind,
  event: PaystackEvent,
  eventId: string,
  options: PaystackCallOptions,
): Promise<ProcessOutcome> {
  switch (kind) {
    case 'charge_success': {
      // A Premium subscription payment uses our hmsub_ reference and has no
      // Order; it upgrades a site instead. Everything else is a sale.
      const reference = extractReference(event);
      if (isSubscriptionReference(reference)) {
        const outcome = await confirmPremiumPayment(reference as string, options);
        return outcome === 'upgraded' || outcome === 'already_active'
          ? 'processed'
          : outcome === 'amount_mismatch'
            ? 'amount_mismatch'
            : 'ignored';
      }
      return handleChargeSuccess(event, eventId, options);
    }
    case 'subscription_created':
      return handleSubscriptionCreated(event.data);
    case 'subscription_not_renewing':
      return handleSubscriptionChange('not_renewing', event.data);
    case 'subscription_disabled':
      return handleSubscriptionChange('disabled', event.data);
    case 'subscription_payment_failed':
      return handleSubscriptionChange('payment_failed', event.data);
    case 'charge_failed':
      return transitionOrder(event, 'failed', ['pending']);
    case 'refund_processed':
      return handleRefundProcessed(event);
    case 'dispute_opened':
      return transitionOrder(event, 'disputed', ['paid']);
    case 'dispute_resolved':
      // Resolution can go either way; the payload says which. Left as a record
      // until the dispute workflow exists.
      return 'ignored';
    case 'transfer_success':
      return handleTransferSuccess(event);
    case 'refund_failed':
    case 'refund_pending':
    case 'transfer_failed':
    case 'ignored':
      return 'ignored';
  }
}

/**
 * The one path that marks money as received.
 *
 * The webhook body is never trusted for the amount. Paystack's verify endpoint
 * is the authority, and its answer must match the order we created — same
 * amount, same currency — before anything is marked paid.
 */
async function handleChargeSuccess(
  event: PaystackEvent,
  eventId: string,
  options: PaystackCallOptions,
): Promise<ProcessOutcome> {
  const reference = extractReference(event);
  if (!reference) return 'order_not_found';
  return confirmChargeByReference(reference, { eventId }, options);
}

export interface ConfirmContext {
  /** Present when a webhook triggered this; absent for the shopper's return. */
  eventId?: string;
}

/**
 * Mark an order paid if — and only if — Paystack's verify endpoint says so.
 *
 * Two callers, one rule. The webhook is the normal path. The storefront's
 * return page is the second: Paystack redirects the shopper back the moment
 * they pay, often before the webhook lands, and on a development machine the
 * webhook cannot reach localhost at all — so without this the shopper would
 * stare at "pending" for an order they have paid for.
 *
 * Calling it twice is safe, in either order. The transition is guarded on
 * `status: 'pending'`, and only the call that actually moves the order writes
 * the ledger entry and takes the stock.
 */
export async function confirmChargeByReference(
  reference: string,
  context: ConfirmContext = {},
  options: PaystackCallOptions = {},
): Promise<ProcessOutcome> {
  const eventId = context.eventId ?? null;

  const order = await findOrderByReference(reference);
  if (!order) return 'order_not_found';

  if (order.status === 'paid') return 'processed'; // Already done; retry is a no-op.

  const verified = await verifyTransaction(reference, options);

  if (verified.status !== 'success') {
    return 'ignored';
  }

  if (verified.amount !== order.totalKobo || verified.currency !== order.currency) {
    // Either a bug on our side or someone paying a different amount than the
    // order says. Never mark it paid; make it loud and let a human look.
    await recordAudit({
      action: 'webhook.amount_mismatch',
      siteId: order.siteId,
      targetType: 'Order',
      targetId: String(order._id),
      before: { expectedKobo: order.totalKobo, expectedCurrency: order.currency },
      after: {
        paystackAmountKobo: verified.amount,
        paystackCurrency: verified.currency,
        reference,
        eventId,
      },
    });
    return 'amount_mismatch';
  }

  const siteId = String(order.siteId);
  const slug = `site-${siteId}`;

  let transitioned = false;
  await runWithTenant({ siteId, slug }, async () => {
    // Guarded on status so two concurrent deliveries cannot both transition it.
    const updated = await Order.updateOne(
      { _id: order._id, status: 'pending' },
      {
        $set: {
          status: 'paid',
          'paystack.transactionId': String(verified.id),
          'paystack.channel': verified.channel,
          'paystack.paidAt': verified.paid_at ? new Date(verified.paid_at) : new Date(),
          'paystack.amountKobo': verified.amount,
          'paystack.currency': verified.currency,
        },
      },
    );

    if (updated.modifiedCount === 0) return;
    transitioned = true;

    // Paystack's reported fee is authoritative; our checkout figure was an
    // estimate for display. The ledger records what actually happened.
    const actualPaystackFee = typeof verified.fees === 'number' ? verified.fees : order.split.paystackFeeKobo;

    await LedgerEntry.create({
      orderId: order._id,
      groupId: new Types.ObjectId(),
      entryType: 'sale',
      grossKobo: order.totalKobo,
      providerFeeKobo: actualPaystackFee,
      platformCommissionKobo: order.split.platformFeeKobo,
      platformCommissionVatKobo: order.split.platformFeeVatKobo,
      sellerNetKobo: order.split.sellerNetKobo,
      status: 'pending', // Settled when Paystack reports settlement, in Phase 5.
      paystack: { reference, transactionId: String(verified.id) },
    });

    await takeStock(order);
  });

  // Only the call that moved the order emails anyone; never throws.
  if (transitioned) await notifyOrderPaid(order);

  return 'processed';
}

/**
 * Reduce tracked stock by what was just paid for.
 *
 * Happens on payment, not at checkout: an abandoned Paystack page must not
 * eat inventory. The price of that choice is that two shoppers can both pay
 * for the last item; the clamp below keeps stock from going negative, and the
 * seller refunds one of them. Selling the last unit twice occasionally is a
 * better failure than a cart that reserves stock nobody pays for.
 *
 * Two plain updates rather than one pipeline update, so this works on every
 * MongoDB-compatible server a contributor might run locally.
 */
async function takeStock(order: OrderAttributes): Promise<void> {
  for (const item of order.items) {
    try {
      const taken = await Product.updateOne(
        {
          _id: item.productId,
          'inventory.track': true,
          'inventory.quantity': { $gte: item.quantity },
        },
        { $inc: { 'inventory.quantity': -item.quantity } },
      );

      if (taken.matchedCount === 0) {
        await Product.updateOne(
          { _id: item.productId, 'inventory.track': true },
          { $set: { 'inventory.quantity': 0 } },
        );
      }
    } catch (error) {
      // The payment and its ledger entry are already recorded, which is what
      // matters. A stock miscount is visible and fixable by the seller; a
      // webhook that fails after money has moved and is retried into the
      // "already paid" branch would lose the stock update anyway.
      console.error(
        'Stock update failed for order',
        String(order._id),
        error instanceof Error ? error.message : 'unknown error',
      );
    }
  }
}

/**
 * A refund Paystack has completed.
 *
 * Two routes lead here: a seller clicked refund in our dashboard (in which case
 * `issueRefund` already wrote the ledger entry), or someone refunded directly
 * in the Paystack dashboard (in which case nobody has). Both end in this
 * webhook, so it writes the entry only if one does not already exist for this
 * Paystack refund id — keyed on the id rather than the amount, because two
 * genuine partial refunds of the same value are not duplicates of each other.
 */
async function handleRefundProcessed(event: PaystackEvent): Promise<ProcessOutcome> {
  const reference = extractReference(event);
  if (!reference) return 'order_not_found';

  const order = await findOrderByReference(reference);
  if (!order) return 'order_not_found';

  const refundId = event.data.id === undefined ? null : String(event.data.id);
  const amountKobo = typeof event.data.amount === 'number' ? event.data.amount : null;
  if (amountKobo === null) return 'ignored';

  const siteId = String(order.siteId);
  const tenant = { siteId, slug: `site-${siteId}` };

  const alreadyRecorded = refundId
    ? await runWithTenant(tenant, () =>
        LedgerEntry.exists({
          orderId: order._id,
          entryType: 'refund',
          'paystack.transactionId': refundId,
        }),
      )
    : null;

  if (alreadyRecorded) {
    // Our own API already recorded it; just make sure the order status agrees.
    return transitionOrder(event, 'refunded', ['paid', 'partially_refunded', 'disputed']);
  }

  const alreadyRefundedKobo = await runWithTenant(tenant, () =>
    refundedTotalForOrder(order._id),
  );

  const split = computeRefundSplit(
    {
      grossKobo: order.totalKobo,
      platformFeeKobo: order.split.platformFeeKobo,
      platformFeeVatKobo: order.split.platformFeeVatKobo,
      paystackFeeKobo: order.split.paystackFeeKobo,
      sellerNetKobo: order.split.sellerNetKobo,
      alreadyRefundedKobo,
    },
    amountKobo,
    readRefundPolicy(),
  );

  await runWithTenant(tenant, async () => {
    const sale = await LedgerEntry.findOne({ orderId: order._id, entryType: 'sale' }).lean();

    await recordRefund({
      groupId: sale?.groupId ?? new Types.ObjectId(),
      orderId: order._id as Types.ObjectId,
      split,
      reference,
      transactionId: refundId ?? undefined,
    });

    await Order.updateOne(
      { _id: order._id },
      { $set: { status: split.isFullRefund ? 'refunded' : 'partially_refunded' } },
    );
  });

  return 'processed';
}

/**
 * Paystack reports money moved out to a bank account.
 *
 * NEEDS CONFIRMATION WITH PAYSTACK: for split transactions the seller's share
 * settles from Paystack to their subaccount, and whether we receive a usable
 * event for that settlement — as opposed to only for our own payouts — has not
 * been verified. Until it is, treat `settledKobo` in seller reporting as
 * best-effort rather than authoritative.
 */
async function handleTransferSuccess(event: PaystackEvent): Promise<ProcessOutcome> {
  const reference = extractReference(event);
  if (!reference) return 'ignored';

  const order = await findOrderByReference(reference);
  if (!order) return 'ignored';

  const siteId = String(order.siteId);
  const tenant = { siteId, slug: `site-${siteId}` };

  return runWithTenant(tenant, async () => {
    const sale = await LedgerEntry.findOne({ orderId: order._id, entryType: 'sale' }).lean();
    if (!sale) return 'ignored';

    const settled = await LedgerEntry.exists({
      groupId: sale.groupId,
      entryType: 'settlement',
    });
    if (settled) return 'processed';

    await recordSettlement({
      groupId: sale.groupId,
      orderId: order._id as Types.ObjectId,
      sellerNetKobo: 0,
      reference,
      settlementId: event.data.id === undefined ? undefined : String(event.data.id),
    });

    return 'processed';
  });
}

/**
 * Move an order to `next`, but only from an expected prior status.
 *
 * Without the guard a late-arriving charge.failed could drag a paid order
 * backwards, or a redelivered refund could overwrite a dispute.
 */
async function transitionOrder(
  event: PaystackEvent,
  next: OrderStatus,
  allowedFrom: OrderStatus[],
): Promise<ProcessOutcome> {
  const reference = extractReference(event);
  if (!reference) return 'order_not_found';

  const order = await findOrderByReference(reference);
  if (!order) return 'order_not_found';

  if (!allowedFrom.includes(order.status)) return 'ignored';

  const siteId = String(order.siteId);
  await runWithTenant({ siteId, slug: `site-${siteId}` }, () =>
    Order.updateOne({ _id: order._id, status: { $in: allowedFrom } }, { $set: { status: next } }),
  );

  return 'processed';
}

/**
 * Orders are tenant-scoped, but a webhook arrives with no tenant — the
 * reference is what identifies the site. Looking it up is therefore a
 * deliberate cross-tenant read, and the reference index is globally unique.
 */
async function findOrderByReference(reference: string): Promise<OrderAttributes | null> {
  return runWithoutTenantScope(
    'resolving a webhook reference to an order, which is what identifies the tenant',
    () => Order.findOne({ 'paystack.reference': reference }),
  );
}

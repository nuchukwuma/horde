/**
 * Refund orchestration.
 *
 * Order of operations is chosen so the failure modes are survivable:
 *
 *   1. Price the refund from the ORDER's stored split and the ledger's record
 *      of what was already refunded. Never from the caller's numbers.
 *   2. Call Paystack.
 *   3. Write the ledger entry and update the order.
 *
 * If step 3 fails after step 2 succeeded, the customer has their money and our
 * ledger is behind. That is recoverable — the refund.processed webhook writes
 * the entry, and reconciliation finds it either way. The reverse (ledger says
 * refunded, customer has nothing) is not recoverable, which is why Paystack
 * goes first.
 */

import { Types } from 'mongoose';
import { Order } from '../db/models/Order';
import { LedgerEntry } from '../db/models/LedgerEntry';
import { refundedTotalForOrder } from '../ledger/balances';
import { recordRefund } from '../ledger/entries';
import { createRefund } from '../paystack/refunds';
import type { PaystackCallOptions } from '../paystack/accounts';
import {
  assertRefundMechanicsConfirmed,
  computeRefundSplit,
  readRefundPolicy,
  RefundError,
  type CommissionRefundPolicy,
} from '../payments/refundPolicy';
import { ConflictError, NotFoundError } from '../errors';
import { runWithTenant } from '../tenant/context';
import { recordAudit } from '../audit';

export interface IssueRefundInput {
  siteId: string;
  siteSlug: string;
  orderId: string;
  /** Kobo. Omit to refund the whole remaining balance. */
  amountKobo?: number;
  reason: string;
  actorUserId: Types.ObjectId;
  actorRole: string;
  /** Overrides the configured policy. Admin-only; the route enforces that. */
  policyOverride?: CommissionRefundPolicy;
  ip?: string;
  userAgent?: string;
}

export interface IssueRefundResult {
  refundId: string;
  refundedKobo: number;
  platformDebitKobo: number;
  sellerDebitKobo: number;
  policy: CommissionRefundPolicy;
  isFullRefund: boolean;
}

export async function issueRefund(
  input: IssueRefundInput,
  options: PaystackCallOptions = {},
): Promise<IssueRefundResult> {
  // Before anything else, including before reading the order: in production
  // this throws until the ADR-0009 question has actually been answered. See
  // assertRefundMechanicsConfirmed for why a documented risk was not enough.
  assertRefundMechanicsConfirmed();

  const tenant = { siteId: input.siteId, slug: input.siteSlug };

  const order = await runWithTenant(tenant, () => Order.findById(input.orderId));
  if (!order) throw new NotFoundError('Order');

  if (!['paid', 'partially_refunded', 'disputed'].includes(order.status)) {
    throw new ConflictError(`An order with status "${order.status}" cannot be refunded`);
  }

  const reference = order.paystack.reference;
  if (!reference) {
    throw new ConflictError('This order has no Paystack reference to refund against');
  }

  // What has already gone back, read from the ledger rather than a counter on
  // the order — the ledger is the record, and a counter could drift from it.
  const alreadyRefundedKobo = await runWithTenant(tenant, () =>
    refundedTotalForOrder(order._id),
  );

  const policy = input.policyOverride ?? readRefundPolicy();
  const amountKobo = input.amountKobo ?? order.totalKobo - alreadyRefundedKobo;

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
    policy,
  );

  const refund = await createRefund(
    {
      transaction: reference,
      amountKobo: split.refundAmountKobo,
      merchantNote: input.reason.slice(0, 200),
    },
    options,
  );

  const groupId = await resolveGroupId(tenant, order._id);

  await runWithTenant(tenant, async () => {
    await recordRefund({
      groupId,
      orderId: order._id,
      split,
      reference,
      transactionId: String(refund.id),
      createdBy: input.actorUserId,
    });

    await Order.updateOne(
      { _id: order._id },
      { $set: { status: split.isFullRefund ? 'refunded' : 'partially_refunded' } },
    );
  });

  await recordAudit({
    action: 'order.refunded',
    siteId: new Types.ObjectId(input.siteId),
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    targetType: 'Order',
    targetId: String(order._id),
    after: {
      refundedKobo: split.refundAmountKobo,
      platformDebitKobo: split.platformDebitKobo,
      sellerDebitKobo: split.sellerDebitKobo,
      policy,
      reason: input.reason,
      paystackRefundId: String(refund.id),
    },
    ip: input.ip,
    userAgent: input.userAgent,
  });

  return {
    refundId: String(refund.id),
    refundedKobo: split.refundAmountKobo,
    platformDebitKobo: split.platformDebitKobo,
    sellerDebitKobo: split.sellerDebitKobo,
    policy,
    isFullRefund: split.isFullRefund,
  };
}

/**
 * Refunds join the sale's group, so one groupId tells the whole story of an
 * order. Falls back to a fresh group if the sale entry is somehow missing,
 * rather than refusing to record a refund that has already happened.
 */
async function resolveGroupId(
  tenant: { siteId: string; slug: string },
  orderId: Types.ObjectId,
): Promise<Types.ObjectId> {
  const sale = await runWithTenant(tenant, () =>
    LedgerEntry.findOne({ orderId, entryType: 'sale' }).lean(),
  );

  return sale?.groupId ?? new Types.ObjectId();
}

export { RefundError };

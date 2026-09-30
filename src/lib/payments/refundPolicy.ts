/**
 * Refund policy: who pays when money goes back to a customer.
 *
 * THE CONFIGURABLE RULE LIVES HERE, and it is deliberately the only place it
 * lives. Three named policies, chosen by configuration:
 *
 *   retain               The platform keeps its commission. The seller funds the
 *                        entire refund. Most platform-favourable; defensible on
 *                        the grounds that we performed the service (we processed
 *                        a sale) regardless of what the seller shipped.
 *
 *   return_proportional  The platform returns commission in proportion to the
 *                        amount refunded. A full refund returns all of it, a
 *                        quarter refund a quarter. This is the fairest default
 *                        and the one most marketplaces use.
 *
 *   return_full          The platform returns its entire commission even on a
 *                        partial refund. Most seller-favourable. Capped so a
 *                        small refund never costs us more than the refund.
 *
 * Whichever is chosen, PAYSTACK'S PROCESSING FEE IS NOT RETURNED. That is the
 * provider's behaviour, not a choice available to us, so on any refund somebody
 * is permanently out that money — by default the seller, since they bore it on
 * the original sale.
 *
 * Pure: no database, no network. The ledger consequences are written by the
 * caller from what this returns.
 */

import { applyBps, assertKobo, subtractKobo } from '../money/kobo';
import { AppError } from '../errors';

export type CommissionRefundPolicy = 'retain' | 'return_proportional' | 'return_full';

const VALID_POLICIES: readonly CommissionRefundPolicy[] = [
  'retain',
  'return_proportional',
  'return_full',
];

/** The original sale's economics, read from the Order's stored split. */
export interface OrderSplitSnapshot {
  grossKobo: number;
  platformFeeKobo: number;
  platformFeeVatKobo: number;
  paystackFeeKobo: number;
  sellerNetKobo: number;
  /** Sum of refunds already issued against this order. */
  alreadyRefundedKobo: number;
}

export interface RefundSplit {
  refundAmountKobo: number;
  /** Commission handed back to the customer's side of the ledger. */
  commissionReturnedKobo: number;
  /** VAT on the returned commission. */
  vatReturnedKobo: number;
  /** Always zero. Kept explicit so the assumption is visible, not implied. */
  providerFeeReturnedKobo: number;
  /** What the refund costs the platform. */
  platformDebitKobo: number;
  /** What the refund costs the seller. */
  sellerDebitKobo: number;
  /** True when this refund exhausts the order's remaining refundable balance. */
  isFullRefund: boolean;
  policy: CommissionRefundPolicy;
}

export class RefundError extends AppError {
  constructor(message: string) {
    super(422, 'refund_invalid', message);
  }
}

/**
 * Read the policy from configuration.
 *
 * Defaults to return_proportional: on a full refund the seller should not be
 * left paying commission on a sale that, from the customer's side, did not
 * happen. Override with REFUND_COMMISSION_POLICY.
 */
export function readRefundPolicy(
  env: Record<string, string | undefined> = process.env,
): CommissionRefundPolicy {
  const configured = env.REFUND_COMMISSION_POLICY as CommissionRefundPolicy | undefined;
  if (!configured) return 'return_proportional';

  if (!VALID_POLICIES.includes(configured)) {
    throw new RefundError(
      `REFUND_COMMISSION_POLICY is "${configured}"; expected one of ${VALID_POLICIES.join(', ')}`,
    );
  }

  return configured;
}

export function computeRefundSplit(
  order: OrderSplitSnapshot,
  refundAmountKobo: number,
  policy: CommissionRefundPolicy,
): RefundSplit {
  assertKobo(refundAmountKobo, 'refundAmountKobo');
  assertKobo(order.grossKobo, 'grossKobo');

  if (!VALID_POLICIES.includes(policy)) {
    throw new RefundError(
      `Unknown refund policy "${policy}". Refusing to guess who absorbs this refund.`,
    );
  }

  if (refundAmountKobo <= 0) {
    throw new RefundError(`Refund must be greater than zero, got ${refundAmountKobo}`);
  }

  const refundable = subtractKobo(order.grossKobo, order.alreadyRefundedKobo);
  if (refundAmountKobo > refundable) {
    throw new RefundError(
      `Cannot refund ${refundAmountKobo} kobo: only ${refundable} kobo remain refundable ` +
        `on an order of ${order.grossKobo} kobo`,
    );
  }

  const commissionReturnedKobo = commissionToReturn(order, refundAmountKobo, policy);

  // VAT follows its commission. Returning a fee but keeping the tax on it would
  // leave us remitting tax on money we gave back.
  const vatReturnedKobo =
    order.platformFeeKobo === 0
      ? 0
      : Math.round((order.platformFeeVatKobo * commissionReturnedKobo) / order.platformFeeKobo);

  // The platform can never hand back more than the refund itself; otherwise a
  // small refund would pay the seller for issuing it.
  const platformDebitKobo = Math.min(commissionReturnedKobo + vatReturnedKobo, refundAmountKobo);
  const sellerDebitKobo = subtractKobo(refundAmountKobo, platformDebitKobo);

  return {
    refundAmountKobo,
    commissionReturnedKobo,
    vatReturnedKobo,
    providerFeeReturnedKobo: 0,
    platformDebitKobo,
    sellerDebitKobo,
    isFullRefund: refundAmountKobo === refundable,
    policy,
  };
}

function commissionToReturn(
  order: OrderSplitSnapshot,
  refundAmountKobo: number,
  policy: CommissionRefundPolicy,
): number {
  switch (policy) {
    case 'retain':
      return 0;

    case 'return_full':
      return order.platformFeeKobo;

    case 'return_proportional': {
      if (order.grossKobo === 0) return 0;
      // Basis points of the order being refunded, then that share of the fee.
      // Integer throughout: the share is derived, never multiplied by a float.
      const shareBps = Math.round((refundAmountKobo * 10_000) / order.grossKobo);
      return applyBps(order.platformFeeKobo, Math.min(shareBps, 10_000));
    }
  }
}

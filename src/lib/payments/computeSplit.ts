/**
 * The fee engine.
 *
 * Pure: no database, no clock, no network. Given an order total and a plan's fee
 * terms it returns every component of the split, and the same inputs always
 * produce the same output. That is what makes it testable to the kobo, and this
 * is the one piece of the system where being off by one kobo per sale compounds
 * into a real reconciliation problem.
 *
 * Every value in and out is integer kobo; every rate is integer basis points.
 */

import {
  addKobo,
  applyBps,
  assertBps,
  assertKobo,
  capKobo,
  subtractKobo,
} from '../money/kobo';
import { AppError } from '../errors';
import { PAYMENT_FEE } from '../../config/fees';

/** The plan's fee terms, as snapshotted onto an Order at creation. */
export interface FeeTerms {
  /** Platform commission rate in basis points. 500 = 5%. */
  feePercentBps: number;
  /** Flat component added to the percentage. */
  feeFlatKobo: number;
  /** Ceiling on the total commission. null = uncapped. */
  feeCapKobo: number | null;
  /** VAT applied to the commission, in basis points. Usually 0 — see ADR notes. */
  vatOnPlatformFeeBps: number;
  /** Who absorbs Paystack's processing fee. */
  paystackFeeBearer: 'platform' | 'seller';
}

export interface Split {
  /** What the customer pays. */
  gross: number;
  /** Our commission, before VAT. */
  platformFee: number;
  /** VAT charged on the commission. */
  platformFeeVat: number;
  /** Paystack's processing fee. */
  paystackFee: number;
  /** What the seller receives. */
  sellerNet: number;
  /** What we actually keep, after bearing the processing fee if we bear it. */
  platformNet: number;
  /**
   * What to send Paystack as `transaction_charge`: the flat amount in kobo
   * routed to the main account, with the remainder going to the subaccount.
   */
  transactionChargeKobo: number;
}

/** A plan whose fees cannot be satisfied by this order. */
export class FeeConfigurationError extends AppError {
  constructor(message: string) {
    super(422, 'fee_configuration_invalid', message, {
      publicMessage: 'This order could not be priced. Please contact support.',
    });
  }
}

/**
 * Paystack's own processing fee.
 *
 * Defaults reflect Paystack's published Nigerian local-card pricing: 1.5% plus
 * ₦100, the ₦100 waived below ₦2,500, capped at ₦2,000.
 *
 * VERIFY THESE AGAINST CURRENT PAYSTACK PRICING before going live, and treat
 * them as an estimate regardless. The authoritative fee is the one Paystack
 * reports on the settled transaction — this model exists to show the seller an
 * expected net at checkout, not to be the source of truth for the ledger.
 */
export interface PaystackFeeModel {
  percentBps: number;
  flatKobo: number;
  /** Below this gross, the flat component is not charged. */
  flatWaiverBelowKobo: number;
  capKobo: number;
}

/** From src/config/fees.ts — placeholder values until confirmed. */
export const DEFAULT_PAYSTACK_FEES: PaystackFeeModel = { ...PAYMENT_FEE };

export function estimatePaystackFee(
  grossKobo: number,
  model: PaystackFeeModel = DEFAULT_PAYSTACK_FEES,
): number {
  assertKobo(grossKobo, 'grossKobo');

  const percentage = applyBps(grossKobo, model.percentBps);
  const flat = grossKobo < model.flatWaiverBelowKobo ? 0 : model.flatKobo;

  return capKobo(addKobo(percentage, flat), model.capKobo);
}

export interface ComputeSplitOptions {
  paystackFees?: PaystackFeeModel;
}

/**
 * Split an order total between the seller, the platform, and Paystack.
 *
 * Rounding happens once, on the commission. Every other figure is derived by
 * subtraction, so the parts always sum back to the gross exactly rather than
 * drifting by a kobo when two independently rounded numbers are added.
 */
export function computeSplit(
  grossKobo: number,
  terms: FeeTerms,
  options: ComputeSplitOptions = {},
): Split {
  assertKobo(grossKobo, 'grossKobo');
  assertBps(terms.feePercentBps, 'feePercentBps');
  assertBps(terms.vatOnPlatformFeeBps, 'vatOnPlatformFeeBps');
  assertKobo(terms.feeFlatKobo, 'feeFlatKobo');

  if (grossKobo <= 0) {
    throw new FeeConfigurationError(`Order total must be greater than zero, got ${grossKobo}`);
  }

  const uncapped = addKobo(applyBps(grossKobo, terms.feePercentBps), terms.feeFlatKobo);

  // The cap binds the percentage and flat components together, then the total
  // is clamped to the order itself: a flat fee larger than a small order must
  // not produce a commission exceeding what the customer paid.
  const platformFee = Math.min(capKobo(uncapped, terms.feeCapKobo), grossKobo);
  const platformFeeVat = applyBps(platformFee, terms.vatOnPlatformFeeBps);
  const paystackFee = estimatePaystackFee(grossKobo, options.paystackFees);

  const transactionChargeKobo = addKobo(platformFee, platformFeeVat);

  const sellerNet =
    terms.paystackFeeBearer === 'seller'
      ? subtractKobo(subtractKobo(grossKobo, transactionChargeKobo), paystackFee)
      : subtractKobo(grossKobo, transactionChargeKobo);

  const platformNet =
    terms.paystackFeeBearer === 'platform'
      ? subtractKobo(transactionChargeKobo, paystackFee)
      : transactionChargeKobo;

  if (sellerNet < 0) {
    throw new FeeConfigurationError(
      `Fees of ${transactionChargeKobo + paystackFee} kobo exceed the order total of ${grossKobo} kobo`,
    );
  }

  return {
    gross: grossKobo,
    platformFee,
    platformFeeVat,
    paystackFee,
    sellerNet,
    platformNet,
    transactionChargeKobo,
  };
}

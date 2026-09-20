/**
 * The fee engine.
 *
 * User journeys these tests encode:
 *
 *  1. As the platform owner, I take a precise, predictable commission from every
 *     sale, so my revenue is auditable and reconcilable against Paystack.
 *  2. As a seller, my net is exactly gross minus the stated fees and nothing
 *     else, so I can check my own payouts.
 *  3. As the platform owner, I choose whether the seller or I absorb Paystack's
 *     processing fee, and the arithmetic stays correct either way.
 *
 * Everything here is integer kobo. A single fractional result anywhere in this
 * file would mean money is being invented or destroyed on every transaction.
 */

import { describe, expect, it } from 'vitest';
import {
  computeSplit,
  DEFAULT_PAYSTACK_FEES,
  estimatePaystackFee,
  FeeConfigurationError,
  type FeeTerms,
} from '../../src/lib/payments/computeSplit';

/** 5% commission, no flat, no cap, no VAT, seller absorbs the Paystack fee. */
const freePlan: FeeTerms = {
  feePercentBps: 500,
  feeFlatKobo: 0,
  feeCapKobo: null,
  vatOnPlatformFeeBps: 0,
  paystackFeeBearer: 'seller',
};

/** 3% + ₦50, capped at ₦1,000. */
const proPlan: FeeTerms = {
  feePercentBps: 300,
  feeFlatKobo: 5_000,
  feeCapKobo: 100_000,
  vatOnPlatformFeeBps: 0,
  paystackFeeBearer: 'seller',
};

const NAIRA = 100;

describe('the required contract', () => {
  it('returns gross, platformFee, and sellerNet', () => {
    const split = computeSplit(10_000 * NAIRA, freePlan);

    expect(split.gross).toBe(1_000_000);
    expect(split.platformFee).toBe(50_000); // 5% of ₦10,000 = ₦500
    expect(typeof split.sellerNet).toBe('number');
  });

  it('returns only whole kobo in every field', () => {
    const split = computeSplit(333_333, { ...proPlan, vatOnPlatformFeeBps: 750 });

    for (const [field, value] of Object.entries(split)) {
      if (typeof value === 'number') {
        expect(Number.isInteger(value), `${field} was ${value}`).toBe(true);
      }
    }
  });
});

describe('percentage commission', () => {
  it('takes the stated percentage', () => {
    expect(computeSplit(100_000, freePlan).platformFee).toBe(5_000);
  });

  it('takes nothing at a zero rate', () => {
    const split = computeSplit(100_000, { ...freePlan, feePercentBps: 0 });
    expect(split.platformFee).toBe(0);
    expect(split.sellerNet).toBe(100_000 - split.paystackFee);
  });

  it('rounds half-up on an odd amount', () => {
    // 5% of 50 kobo is 2.5 → 3
    expect(computeSplit(50, { ...freePlan, paystackFeeBearer: 'platform' }).platformFee).toBe(3);
  });
});

describe('flat component', () => {
  it('adds the flat fee to the percentage', () => {
    // 3% of ₦10,000 = ₦300, plus ₦50 flat = ₦350
    expect(computeSplit(10_000 * NAIRA, proPlan).platformFee).toBe(35_000);
  });

  it('charges the flat fee even when the percentage is zero', () => {
    const split = computeSplit(10_000 * NAIRA, { ...proPlan, feePercentBps: 0 });
    expect(split.platformFee).toBe(5_000);
  });
});

describe('the cap', () => {
  it('caps a large order', () => {
    // 3% of ₦1,000,000 = ₦30,000 + ₦50 flat, capped at ₦1,000
    expect(computeSplit(1_000_000 * NAIRA, proPlan).platformFee).toBe(100_000);
  });

  it('leaves an order under the cap alone', () => {
    expect(computeSplit(10_000 * NAIRA, proPlan).platformFee).toBe(35_000);
  });

  it('applies the cap to percentage and flat combined, not just the percentage', () => {
    const plan: FeeTerms = { ...proPlan, feeFlatKobo: 200_000, feeCapKobo: 100_000 };
    expect(computeSplit(10_000 * NAIRA, plan).platformFee).toBe(100_000);
  });

  it('treats a null cap as uncapped', () => {
    const split = computeSplit(1_000_000 * NAIRA, { ...proPlan, feeCapKobo: null });
    expect(split.platformFee).toBe(3_005_000); // 3% + ₦50
  });
});

describe('VAT on the platform fee', () => {
  it('is zero when unconfigured, which is the default', () => {
    expect(computeSplit(10_000 * NAIRA, proPlan).platformFeeVat).toBe(0);
  });

  it('applies to the commission, not to the order total', () => {
    // 7.5% VAT on a ₦350 commission = ₦26.25 → 2625 kobo
    const split = computeSplit(10_000 * NAIRA, { ...proPlan, vatOnPlatformFeeBps: 750 });
    expect(split.platformFee).toBe(35_000);
    expect(split.platformFeeVat).toBe(2_625);
  });

  it('is deducted from the seller alongside the commission', () => {
    const plan = { ...proPlan, vatOnPlatformFeeBps: 750 };
    const split = computeSplit(10_000 * NAIRA, plan);
    expect(split.sellerNet).toBe(
      split.gross - split.platformFee - split.platformFeeVat - split.paystackFee,
    );
  });
});

describe('who bears the Paystack fee', () => {
  it('deducts it from the seller when the seller bears it', () => {
    const split = computeSplit(10_000 * NAIRA, { ...proPlan, paystackFeeBearer: 'seller' });

    expect(split.sellerNet).toBe(split.gross - split.platformFee - split.paystackFee);
    // We keep the whole commission.
    expect(split.platformNet).toBe(split.platformFee + split.platformFeeVat);
  });

  it('deducts it from the platform when the platform bears it', () => {
    const split = computeSplit(10_000 * NAIRA, { ...proPlan, paystackFeeBearer: 'platform' });

    expect(split.sellerNet).toBe(split.gross - split.platformFee);
    expect(split.platformNet).toBe(split.platformFee + split.platformFeeVat - split.paystackFee);
  });

  it('charges the seller the same gross either way', () => {
    const asSeller = computeSplit(10_000 * NAIRA, { ...proPlan, paystackFeeBearer: 'seller' });
    const asPlatform = computeSplit(10_000 * NAIRA, { ...proPlan, paystackFeeBearer: 'platform' });

    // The customer pays the same; only who absorbs the processing fee moves.
    expect(asSeller.gross).toBe(asPlatform.gross);
    expect(asSeller.paystackFee).toBe(asPlatform.paystackFee);
    expect(asPlatform.sellerNet).toBeGreaterThan(asSeller.sellerNet);
  });
});

describe('conservation — no kobo is created or destroyed', () => {
  it('balances when the seller bears the processing fee', () => {
    for (let gross = 10_000; gross < 5_000_000; gross += 37_337) {
      const split = computeSplit(gross, { ...proPlan, vatOnPlatformFeeBps: 750 });
      expect(split.transactionChargeKobo + split.paystackFee + split.sellerNet).toBe(gross);
    }
  });

  it('balances when the platform bears the processing fee', () => {
    for (let gross = 10_000; gross < 5_000_000; gross += 37_337) {
      const split = computeSplit(gross, {
        ...proPlan,
        vatOnPlatformFeeBps: 750,
        paystackFeeBearer: 'platform',
      });
      // Paystack takes its cut out of our charge, so gross splits two ways.
      expect(split.transactionChargeKobo + split.sellerNet).toBe(gross);
      expect(split.platformNet + split.paystackFee).toBe(split.transactionChargeKobo);
    }
  });

  it('balances across every plan shape', () => {
    const shapes: FeeTerms[] = [
      freePlan,
      proPlan,
      { ...proPlan, feePercentBps: 0 },
      { ...proPlan, feeFlatKobo: 0 },
      { ...proPlan, feeCapKobo: null },
      { ...proPlan, vatOnPlatformFeeBps: 750 },
      { ...proPlan, paystackFeeBearer: 'platform' },
    ];

    for (const plan of shapes) {
      for (const gross of [10_000, 249_999, 250_000, 1_000_000, 99_999_999]) {
        const split = computeSplit(gross, plan);
        const paystackShare = plan.paystackFeeBearer === 'seller' ? split.paystackFee : 0;
        expect(
          split.transactionChargeKobo + paystackShare + split.sellerNet,
          `plan=${JSON.stringify(plan)} gross=${gross}`,
        ).toBe(gross);
      }
    }
  });

  it('balances for a plan with no flat component, down to one kobo', () => {
    // A purely percentage-based plan has no minimum viable order.
    for (const gross of [1, 2, 99, 100, 2_500]) {
      const split = computeSplit(gross, freePlan);
      expect(split.transactionChargeKobo + split.paystackFee + split.sellerNet).toBe(gross);
    }
  });
});

describe('a flat fee creates a minimum viable order size', () => {
  // Worth stating outright: with a ₦50 flat fee, a ₦10 order cannot be priced —
  // the fee plus Paystack's cut exceeds what the customer paid. Checkout must
  // surface this rather than letting a seller list unsellable items.
  it('refuses an order smaller than the flat fee', () => {
    expect(() => computeSplit(1_000, proPlan)).toThrow(FeeConfigurationError);
  });

  it('prices an order comfortably above the flat fee', () => {
    const split = computeSplit(10_000, proPlan);
    expect(split.sellerNet).toBeGreaterThan(0);
  });

  it('says what went wrong, in kobo', () => {
    expect(() => computeSplit(1_000, proPlan)).toThrow(/exceed the order total of 1000 kobo/);
  });
});

describe('the seller is never paid a negative amount', () => {
  it('clamps a flat fee larger than the order', () => {
    const plan: FeeTerms = { ...freePlan, feeFlatKobo: 500_000, paystackFeeBearer: 'platform' };
    const split = computeSplit(10_000, plan);

    expect(split.sellerNet).toBeGreaterThanOrEqual(0);
    expect(split.platformFee).toBeLessThanOrEqual(split.gross);
  });

  it('throws rather than paying a negative net when fees exceed the order', () => {
    // A plan that cannot be satisfied is a misconfiguration. Silently handing
    // the seller a negative payout would be worse than refusing the sale.
    const plan: FeeTerms = {
      feePercentBps: 10_000,
      feeFlatKobo: 100_000,
      feeCapKobo: null,
      vatOnPlatformFeeBps: 0,
      paystackFeeBearer: 'seller',
    };
    expect(() => computeSplit(1_000, plan)).toThrow(FeeConfigurationError);
  });
});

describe('input validation', () => {
  it('rejects a zero-value order', () => {
    expect(() => computeSplit(0, freePlan)).toThrow(FeeConfigurationError);
  });

  it('rejects a negative order', () => {
    expect(() => computeSplit(-100, freePlan)).toThrow();
  });

  it('rejects a fractional order total', () => {
    expect(() => computeSplit(1999.5, freePlan)).toThrow();
  });

  it('rejects a rate expressed as a fraction rather than basis points', () => {
    expect(() => computeSplit(100_000, { ...freePlan, feePercentBps: 0.05 })).toThrow();
  });

  it('rejects a rate above 100%', () => {
    expect(() => computeSplit(100_000, { ...freePlan, feePercentBps: 10_001 })).toThrow();
  });
});

describe('Paystack processing fee model', () => {
  it('waives the flat component below the waiver threshold', () => {
    // Paystack does not add the ₦100 on small local transactions.
    const fee = estimatePaystackFee(200_000, DEFAULT_PAYSTACK_FEES); // ₦2,000
    expect(fee).toBe(3_000); // 1.5% only
  });

  it('adds the flat component at and above the threshold', () => {
    const fee = estimatePaystackFee(250_000, DEFAULT_PAYSTACK_FEES); // ₦2,500
    expect(fee).toBe(3_750 + 10_000); // 1.5% + ₦100
  });

  it('caps the fee', () => {
    const fee = estimatePaystackFee(100_000_000, DEFAULT_PAYSTACK_FEES); // ₦1,000,000
    expect(fee).toBe(DEFAULT_PAYSTACK_FEES.capKobo);
  });

  it('never returns a fractional fee', () => {
    for (const gross of [1, 999, 249_999, 250_001, 12_345_678]) {
      expect(Number.isInteger(estimatePaystackFee(gross, DEFAULT_PAYSTACK_FEES))).toBe(true);
    }
  });
});

describe('the transaction charge sent to Paystack', () => {
  it('is the commission plus its VAT', () => {
    const split = computeSplit(10_000 * NAIRA, { ...proPlan, vatOnPlatformFeeBps: 750 });
    expect(split.transactionChargeKobo).toBe(split.platformFee + split.platformFeeVat);
  });

  it('never exceeds the order total', () => {
    const plan: FeeTerms = { ...freePlan, feeFlatKobo: 5_000_000 };
    const split = computeSplit(100_000, { ...plan, paystackFeeBearer: 'platform' });
    expect(split.transactionChargeKobo).toBeLessThanOrEqual(split.gross);
  });
});

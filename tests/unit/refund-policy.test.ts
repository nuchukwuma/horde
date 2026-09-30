/**
 * Refund policy: who bears the cost when money goes back to a customer.
 *
 * User journeys these tests encode:
 *
 *  1. As the platform owner, I decide by configuration whether I return my
 *     commission on a refund, so the rule is explicit rather than implied by
 *     whatever the code happens to do.
 *  2. As a seller, the amount taken from me on a refund is exactly the refund
 *     minus whatever the platform gave back, so I can check it.
 *  3. As either party, the money returned to a customer always adds up: every
 *     kobo refunded came from someone's side of the split.
 *
 * Paystack's processing fee is NOT returned on a refund. That is the provider's
 * behaviour, not our choice, and the arithmetic has to reflect it.
 */

import { describe, expect, it } from 'vitest';
import {
  computeRefundSplit,
  RefundError,
  type OrderSplitSnapshot,
  type CommissionRefundPolicy,
} from '../../src/lib/payments/refundPolicy';

/** ₦10,000 order, 3% + ₦50 commission, seller bore the Paystack fee. */
const order: OrderSplitSnapshot = {
  grossKobo: 1_000_000,
  platformFeeKobo: 35_000,
  platformFeeVatKobo: 0,
  paystackFeeKobo: 15_000,
  sellerNetKobo: 950_000,
  alreadyRefundedKobo: 0,
};

describe('retain — the platform keeps its commission', () => {
  const policy: CommissionRefundPolicy = 'retain';

  it('returns nothing from the platform on a full refund', () => {
    const result = computeRefundSplit(order, 1_000_000, policy);

    expect(result.commissionReturnedKobo).toBe(0);
    expect(result.platformDebitKobo).toBe(0);
    // The seller funds the entire refund.
    expect(result.sellerDebitKobo).toBe(1_000_000);
  });

  it('returns nothing on a partial refund either', () => {
    const result = computeRefundSplit(order, 250_000, policy);

    expect(result.commissionReturnedKobo).toBe(0);
    expect(result.sellerDebitKobo).toBe(250_000);
  });
});

describe('return_proportional — commission comes back in proportion', () => {
  const policy: CommissionRefundPolicy = 'return_proportional';

  it('returns the whole commission on a full refund', () => {
    const result = computeRefundSplit(order, 1_000_000, policy);

    expect(result.commissionReturnedKobo).toBe(35_000);
    expect(result.platformDebitKobo).toBe(35_000);
    expect(result.sellerDebitKobo).toBe(965_000);
  });

  it('returns a quarter of the commission on a quarter refund', () => {
    const result = computeRefundSplit(order, 250_000, policy);

    expect(result.commissionReturnedKobo).toBe(8_750);
    expect(result.sellerDebitKobo).toBe(241_250);
  });

  it('returns the VAT on the returned commission too', () => {
    // Returning a fee without its VAT would leave us remitting tax on money we
    // gave back.
    const withVat: OrderSplitSnapshot = { ...order, platformFeeVatKobo: 2_625 };
    const result = computeRefundSplit(withVat, 1_000_000, policy);

    expect(result.commissionReturnedKobo).toBe(35_000);
    expect(result.vatReturnedKobo).toBe(2_625);
    expect(result.platformDebitKobo).toBe(37_625);
  });

  it('rounds without inventing kobo', () => {
    const odd: OrderSplitSnapshot = { ...order, grossKobo: 999_999 };
    const result = computeRefundSplit(odd, 333_333, policy);

    expect(Number.isInteger(result.commissionReturnedKobo)).toBe(true);
    expect(result.platformDebitKobo + result.sellerDebitKobo).toBe(333_333);
  });
});

describe('return_full — the platform returns all of its commission', () => {
  const policy: CommissionRefundPolicy = 'return_full';

  it('returns the whole commission on a full refund', () => {
    const result = computeRefundSplit(order, 1_000_000, policy);
    expect(result.commissionReturnedKobo).toBe(35_000);
  });

  it('returns the whole commission even on a partial refund', () => {
    const result = computeRefundSplit(order, 500_000, policy);

    expect(result.commissionReturnedKobo).toBe(35_000);
    expect(result.sellerDebitKobo).toBe(465_000);
  });

  it('never returns more than the refund itself', () => {
    // A ₦100 refund cannot cost the platform ₦350: that would pay the seller
    // for the privilege of refunding a customer.
    const result = computeRefundSplit(order, 10_000, policy);

    expect(result.platformDebitKobo).toBeLessThanOrEqual(10_000);
    expect(result.sellerDebitKobo).toBeGreaterThanOrEqual(0);
  });
});

describe("Paystack's processing fee is not returned", () => {
  it.each(['retain', 'return_proportional', 'return_full'] as CommissionRefundPolicy[])(
    'keeps providerFeeReturned at zero under %s',
    (policy) => {
      const result = computeRefundSplit(order, 1_000_000, policy);
      expect(result.providerFeeReturnedKobo).toBe(0);
    },
  );

  it('means a full refund still leaves the transaction net-negative overall', () => {
    // Worth stating plainly: somebody is always out the processing fee.
    const result = computeRefundSplit(order, 1_000_000, 'return_proportional');
    expect(result.providerFeeReturnedKobo).toBe(0);
    expect(order.paystackFeeKobo).toBeGreaterThan(0);
  });
});

describe('conservation — every refunded kobo comes from someone', () => {
  it('holds across policies, amounts, and VAT settings', () => {
    const policies: CommissionRefundPolicy[] = ['retain', 'return_proportional', 'return_full'];
    const orders: OrderSplitSnapshot[] = [
      order,
      { ...order, platformFeeVatKobo: 2_625 },
      { ...order, platformFeeKobo: 0 },
      { ...order, platformFeeKobo: 999_999, sellerNetKobo: 1 },
    ];

    for (const policy of policies) {
      for (const snapshot of orders) {
        for (const amount of [1, 1_000, 250_000, 999_999, snapshot.grossKobo]) {
          if (amount > snapshot.grossKobo) continue;
          const result = computeRefundSplit(snapshot, amount, policy);

          expect(
            result.platformDebitKobo + result.sellerDebitKobo,
            `policy=${policy} amount=${amount}`,
          ).toBe(amount);
          expect(result.platformDebitKobo).toBeGreaterThanOrEqual(0);
          expect(result.sellerDebitKobo).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});

describe('refund validation', () => {
  it('rejects a refund larger than the order', () => {
    expect(() => computeRefundSplit(order, 1_000_001, 'retain')).toThrow(RefundError);
  });

  it('rejects a zero or negative refund', () => {
    expect(() => computeRefundSplit(order, 0, 'retain')).toThrow(RefundError);
    expect(() => computeRefundSplit(order, -1, 'retain')).toThrow(RefundError);
  });

  it('rejects a fractional refund', () => {
    expect(() => computeRefundSplit(order, 100.5, 'retain')).toThrow();
  });

  it('accounts for what has already been refunded', () => {
    const partiallyRefunded: OrderSplitSnapshot = { ...order, alreadyRefundedKobo: 900_000 };

    // Only ₦1,000 remains refundable.
    expect(() => computeRefundSplit(partiallyRefunded, 200_000, 'retain')).toThrow(RefundError);
    expect(() => computeRefundSplit(partiallyRefunded, 100_000, 'retain')).not.toThrow();
  });

  it('reports how much is actually refundable', () => {
    const partiallyRefunded: OrderSplitSnapshot = { ...order, alreadyRefundedKobo: 900_000 };
    expect(() => computeRefundSplit(partiallyRefunded, 200_000, 'retain')).toThrow(
      /100000 kobo remain/,
    );
  });

  it('rejects an unknown policy rather than defaulting to one', () => {
    // Defaulting here would silently pick who pays.
    expect(() =>
      computeRefundSplit(order, 1_000, 'generous' as CommissionRefundPolicy),
    ).toThrow(RefundError);
  });
});

describe('full versus partial classification', () => {
  it('marks a refund of the whole remaining balance as full', () => {
    expect(computeRefundSplit(order, 1_000_000, 'retain').isFullRefund).toBe(true);
  });

  it('marks anything less as partial', () => {
    expect(computeRefundSplit(order, 999_999, 'retain').isFullRefund).toBe(false);
  });

  it('marks a final top-up refund as full', () => {
    const partiallyRefunded: OrderSplitSnapshot = { ...order, alreadyRefundedKobo: 900_000 };
    expect(computeRefundSplit(partiallyRefunded, 100_000, 'retain').isFullRefund).toBe(true);
  });
});

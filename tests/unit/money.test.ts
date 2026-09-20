/**
 * AC-004: money is integer kobo, always.
 *
 * Also pins the arithmetic the fee engine will be built on in Phase 3, so a
 * rounding change there surfaces as a failing test rather than as slow drift
 * between what sellers are owed and what they are paid.
 */

import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import {
  MAX_KOBO,
  MoneyError,
  addKobo,
  applyBps,
  assertKobo,
  capKobo,
  formatKobo,
  nairaToKobo,
  subtractKobo,
} from '../../src/lib/money/kobo';
import { Product } from '../../src/lib/db/models/Product';
import { Order } from '../../src/lib/db/models/Order';
import { runWithTenant } from '../../src/lib/tenant/context';

describe('assertKobo', () => {
  it('accepts whole numbers', () => {
    expect(assertKobo(0)).toBe(0);
    expect(assertKobo(150_000)).toBe(150_000);
  });

  it('rejects fractional kobo', () => {
    expect(() => assertKobo(1999.5)).toThrow(MoneyError);
    expect(() => assertKobo(0.1 + 0.2)).toThrow(MoneyError);
  });

  it('rejects NaN and Infinity', () => {
    expect(() => assertKobo(Number.NaN)).toThrow(MoneyError);
    expect(() => assertKobo(Number.POSITIVE_INFINITY)).toThrow(MoneyError);
  });

  it('rejects a numeric string, which would concatenate rather than add', () => {
    expect(() => assertKobo('1000')).toThrow(MoneyError);
  });

  it('rejects values above MAX_KOBO, which usually means naira was passed as kobo', () => {
    expect(() => assertKobo(MAX_KOBO + 1)).toThrow(MoneyError);
  });
});

describe('applyBps', () => {
  it('computes a plain percentage', () => {
    expect(applyBps(100_000, 500)).toBe(5_000); // 5% of ₦1,000.00
  });

  it('returns zero for a zero rate', () => {
    expect(applyBps(100_000, 0)).toBe(0);
  });

  it('returns the whole amount at 100%', () => {
    expect(applyBps(100_000, 10_000)).toBe(100_000);
  });

  it('rounds half-up by default', () => {
    expect(applyBps(50, 500)).toBe(3); // 2.5 → 3
  });

  it('honours explicit rounding modes', () => {
    expect(applyBps(50, 500, 'down')).toBe(2);
    expect(applyBps(50, 500, 'up')).toBe(3);
  });

  it('stays exact where float multiplication would not', () => {
    // 1e14 * 750 is 7.5e16 — past where doubles still count in ones.
    expect(applyBps(100_000_000_000_000, 750)).toBe(7_500_000_000_000);
  });

  it('never returns a fractional result', () => {
    for (const amount of [1, 7, 33, 101, 9_999, 123_457]) {
      for (const bps of [1, 150, 499, 750, 2_500]) {
        expect(Number.isInteger(applyBps(amount, bps))).toBe(true);
      }
    }
  });

  it('rejects a rate expressed as a fraction rather than basis points', () => {
    // 0.05 meaning "5%" is the classic float-percentage bug.
    expect(() => applyBps(100_000, 0.05)).toThrow(MoneyError);
  });

  it('rejects a rate above 100%', () => {
    expect(() => applyBps(100_000, 10_001)).toThrow(MoneyError);
  });
});

describe('fee and net always reconcile', () => {
  it('fee + net === gross across a wide sweep', () => {
    for (let gross = 1; gross < 20_000; gross += 137) {
      for (const bps of [0, 1, 150, 500, 750, 2_500, 10_000]) {
        const fee = applyBps(gross, bps);
        const net = subtractKobo(gross, fee);
        expect(addKobo(fee, net)).toBe(gross);
      }
    }
  });
});

describe('addKobo / subtractKobo', () => {
  it('adds and subtracts', () => {
    expect(addKobo(100, 250, 3)).toBe(353);
    expect(subtractKobo(1_000, 250)).toBe(750);
  });

  it('rejects a fractional operand rather than silently producing one', () => {
    expect(() => addKobo(100, 0.5)).toThrow(MoneyError);
  });
});

describe('capKobo', () => {
  it('caps when a cap is set', () => {
    expect(capKobo(10_000, 2_500)).toBe(2_500);
  });

  it('leaves amounts under the cap alone', () => {
    expect(capKobo(1_000, 2_500)).toBe(1_000);
  });

  it('passes through when uncapped', () => {
    expect(capKobo(10_000, null)).toBe(10_000);
    expect(capKobo(10_000, undefined)).toBe(10_000);
  });
});

describe('nairaToKobo', () => {
  it('converts whole naira', () => {
    expect(nairaToKobo('2500')).toBe(250_000);
  });

  it('converts naira with kobo', () => {
    expect(nairaToKobo('2500.75')).toBe(250_075);
    expect(nairaToKobo('0.05')).toBe(5);
  });

  it('pads a single decimal place correctly', () => {
    expect(nairaToKobo('10.5')).toBe(1_050);
  });

  it('rejects more than two decimal places', () => {
    expect(() => nairaToKobo('10.555')).toThrow(MoneyError);
  });

  it('rejects a float argument, which has already lost precision', () => {
    expect(() => nairaToKobo(2500.75)).toThrow(MoneyError);
  });

  it('accepts an integral number argument', () => {
    expect(nairaToKobo(2500)).toBe(250_000);
  });

  it('rejects formatted or empty input', () => {
    expect(() => nairaToKobo('₦2,500')).toThrow(MoneyError);
    expect(() => nairaToKobo('')).toThrow(MoneyError);
    expect(() => nairaToKobo('abc')).toThrow(MoneyError);
  });
});

describe('formatKobo', () => {
  it('renders naira and kobo', () => {
    expect(formatKobo(250_075)).toBe('₦2,500.75');
    expect(formatKobo(5)).toBe('₦0.05');
    expect(formatKobo(0)).toBe('₦0.00');
    expect(formatKobo(-250_075)).toBe('-₦2,500.75');
  });
});

const tenant = { siteId: new Types.ObjectId().toHexString(), slug: 'money-test' };

describe('AC-004 — schema validation rejects non-integer money', () => {
  it('refuses a fractional priceKobo', async () => {
    const product = new Product({ title: 'Bad', slug: 'bad', priceKobo: 1999.5 });
    await expect(runWithTenant(tenant, () => product.validate())).rejects.toThrow(
      /whole number of kobo/,
    );
  });

  it('refuses a negative priceKobo', async () => {
    const product = new Product({ title: 'Negative', slug: 'negative', priceKobo: -100 });
    await expect(runWithTenant(tenant, () => product.validate())).rejects.toThrow(
      /not be negative/,
    );
  });

  it('accepts a valid integer price', async () => {
    const product = new Product({ title: 'Good', slug: 'good', priceKobo: 199_950 });
    await expect(runWithTenant(tenant, () => product.validate())).resolves.toBeUndefined();
  });

  it('refuses fractional money anywhere in an order split', async () => {
    const order = new Order({
      orderNumber: 'HM-1',
      customerEmail: 'buyer@example.com',
      items: [
        {
          productId: new Types.ObjectId(),
          title: 'Item',
          unitPriceKobo: 100_000,
          quantity: 1,
          lineTotalKobo: 100_000,
        },
      ],
      subtotalKobo: 100_000,
      totalKobo: 100_000,
      feeSnapshot: {
        planCode: 'free',
        feePercentBps: 500,
        feeFlatKobo: 0,
        feeCapKobo: null,
        vatOnPlatformFeeBps: 0,
        paystackFeeBearer: 'seller',
      },
      split: {
        grossKobo: 100_000,
        platformFeeKobo: 5_000.5,
        platformFeeVatKobo: 0,
        paystackFeeKobo: 0,
        sellerNetKobo: 94_999.5,
      },
    });
    await expect(runWithTenant(tenant, () => order.validate())).rejects.toThrow(
      /whole number of kobo/,
    );
  });

  it('requires an order to have at least one item', async () => {
    const order = new Order({
      orderNumber: 'HM-2',
      customerEmail: 'buyer@example.com',
      items: [],
      subtotalKobo: 0,
      totalKobo: 0,
      feeSnapshot: {
        planCode: 'free',
        feePercentBps: 500,
        feeFlatKobo: 0,
        feeCapKobo: null,
        vatOnPlatformFeeBps: 0,
        paystackFeeBearer: 'seller',
      },
      split: {
        grossKobo: 0,
        platformFeeKobo: 0,
        platformFeeVatKobo: 0,
        paystackFeeKobo: 0,
        sellerNetKobo: 0,
      },
    });
    await expect(runWithTenant(tenant, () => order.validate())).rejects.toThrow(
      /at least one item/,
    );
  });

  it('refuses to validate tenant data with no tenant in scope at all', async () => {
    const product = new Product({ title: 'Orphan', slug: 'orphan', priceKobo: 100 });
    await expect(product.validate()).rejects.toThrow(/No tenant in scope/);
  });
});

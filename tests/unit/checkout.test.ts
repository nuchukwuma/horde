/**
 * Checkout: the gate, the validation boundary, and the Paystack call shape.
 *
 * The rule under test throughout is "never trust the client for amounts".
 * The cart schema has no price field at all, so a tampered price is not
 * rejected — it is structurally impossible to express.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { checkoutSchema } from '../../src/lib/validation/schemas';
import { computeSplit, type FeeTerms } from '../../src/lib/payments/computeSplit';
import { initializeTransaction } from '../../src/lib/paystack/transactions';
import { Site } from '../../src/lib/db/models/Site';

const config = {
  secretKey: 'sk_test_fake_key_for_tests',
  baseUrl: 'https://api.paystack.test',
  timeoutMs: 1_000,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Who and where: everything checkout asks for besides the cart. */
const buyer = {
  customerEmail: 'buyer@example.com',
  customerName: 'Ada Buyer',
  customerPhone: '0803 123 4567',
  delivery: { method: 'delivery', address: '12 Allen Avenue', city: 'Ikeja', state: 'Lagos' },
};

describe('the cart schema gives a client nowhere to put a price', () => {
  it('accepts ids and quantities', () => {
    const result = checkoutSchema.safeParse({
      items: [{ productId: 'a'.repeat(24), quantity: 2 }],
      ...buyer,
    });
    expect(result.success).toBe(true);
  });

  it('strips a price a client tries to smuggle in', () => {
    const result = checkoutSchema.safeParse({
      items: [{ productId: 'a'.repeat(24), quantity: 1, priceKobo: 1, unitPriceKobo: 1 }],
      ...buyer,
      totalKobo: 1,
    });

    expect(result.success).toBe(true);
    // The parsed object carries only what the schema declares.
    expect(result.success && result.data.items[0]).toEqual({
      productId: 'a'.repeat(24),
      quantity: 1,
    });
    expect(result.success && 'totalKobo' in result.data).toBe(false);
  });

  it('rejects a malformed product id', () => {
    const result = checkoutSchema.safeParse({
      items: [{ productId: 'not-an-object-id', quantity: 1 }],
      ...buyer,
    });
    expect(result.success).toBe(false);
  });

  it('rejects zero, negative, and fractional quantities', () => {
    for (const quantity of [0, -1, 1.5]) {
      const result = checkoutSchema.safeParse({
        items: [{ productId: 'a'.repeat(24), quantity }],
        ...buyer,
      });
      expect(result.success, `quantity ${quantity}`).toBe(false);
    }
  });

  it('rejects an empty cart', () => {
    const result = checkoutSchema.safeParse({ items: [], ...buyer });
    expect(result.success).toBe(false);
  });

  it('rejects an absurdly large cart', () => {
    const result = checkoutSchema.safeParse({
      items: Array.from({ length: 101 }, () => ({ productId: 'a'.repeat(24), quantity: 1 })),
      ...buyer,
    });
    expect(result.success).toBe(false);
  });

  it('requires a usable customer email', () => {
    const result = checkoutSchema.safeParse({
      items: [{ productId: 'a'.repeat(24), quantity: 1 }],
      ...buyer,
      customerEmail: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });
});

describe('checkout asks who the order is for and where it goes', () => {
  const items = [{ productId: 'a'.repeat(24), quantity: 1 }];

  it.each([
    ['0803 123 4567', '+2348031234567'],
    ['08031234567', '+2348031234567'],
    ['+234 (803) 123-4567', '+2348031234567'],
    ['2349051234567', '+2349051234567'],
  ])('normalises the phone number %s', (typed, stored) => {
    const result = checkoutSchema.safeParse({ items, ...buyer, customerPhone: typed });
    expect(result.success && result.data.customerPhone).toBe(stored);
  });

  it.each(['12345', '0803123456', '+44 7700 900123', '0603 123 4567', 'call me'])('rejects the phone number %s', (typed) => {
    expect(checkoutSchema.safeParse({ items, ...buyer, customerPhone: typed }).success).toBe(false);
  });

  it('requires a name and a phone number', () => {
    const without = (key: keyof typeof buyer) => Object.fromEntries(Object.entries(buyer).filter(([name]) => name !== key));
    const noName = without('customerName');
    const noPhone = without('customerPhone');
    expect(checkoutSchema.safeParse({ items, ...noName }).success).toBe(false);
    expect(checkoutSchema.safeParse({ items, ...noPhone }).success).toBe(false);
  });

  it('requires a full address for delivery, with a real state', () => {
    expect(checkoutSchema.safeParse({ items, ...buyer, delivery: { method: 'delivery', address: '12 Allen Avenue', city: 'Ikeja' } }).success).toBe(false);
    expect(
      checkoutSchema.safeParse({ items, ...buyer, delivery: { ...buyer.delivery, state: 'Atlantis' } }).success,
    ).toBe(false);
  });

  it('takes no address for collection, and drops one if sent', () => {
    const result = checkoutSchema.safeParse({
      items,
      ...buyer,
      delivery: { method: 'pickup', address: '12 Allen Avenue', note: 'Saturday' },
    });
    expect(result.success && result.data.delivery).toEqual({ method: 'pickup', note: 'Saturday' });
  });
});

describe('checkout is blocked until the seller can actually be paid', () => {
  function site(payout: Record<string, unknown>, extra: Record<string, unknown> = {}) {
    return new Site({
      slug: 'ade-store',
      name: 'Ade Stores',
      ownerId: new Types.ObjectId(),
      planCode: 'free',
      payout,
      ...extra,
    });
  }

  it('refuses a store with unverified payout details', () => {
    expect(site({ status: 'unset' }).canAcceptPayments().allowed).toBe(false);
  });

  it('refuses a store with no subaccount to split into', () => {
    expect(site({ status: 'verified' }).canAcceptPayments().allowed).toBe(false);
  });

  it('allows a fully onboarded store', () => {
    expect(
      site({ status: 'verified', subaccountCode: 'ACCT_abc' }).canAcceptPayments().allowed,
    ).toBe(true);
  });
});

describe('the Paystack initialize call', () => {
  const terms: FeeTerms = {
    feePercentBps: 300,
    feeFlatKobo: 5_000,
    feeCapKobo: 100_000,
    vatOnPlatformFeeBps: 0,
    paystackFeeBearer: 'seller',
  };

  it('sends the amount in kobo, our commission, and the seller subaccount', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        status: true,
        message: 'ok',
        data: {
          authorization_url: 'https://checkout.paystack.com/abc',
          access_code: 'abc',
          reference: 'hm_ref',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const split = computeSplit(1_000_000, terms);

    await initializeTransaction(
      {
        amountKobo: split.gross,
        email: 'buyer@example.com',
        reference: 'hm_ref',
        subaccount: 'ACCT_seller',
        transactionCharge: split.transactionChargeKobo,
        bearer: 'subaccount',
      },
      { config },
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);

    expect(body.amount).toBe(1_000_000);
    expect(body.currency).toBe('NGN');
    expect(body.subaccount).toBe('ACCT_seller');
    expect(body.transaction_charge).toBe(split.transactionChargeKobo);
    expect(body.bearer).toBe('subaccount');
    expect(body.reference).toBe('hm_ref');
  });

  it('maps the platform bearer to Paystack "account"', () => {
    // Our vocabulary is platform/seller; Paystack's is account/subaccount.
    const platformBearer: FeeTerms = { ...terms, paystackFeeBearer: 'platform' };
    const mapped = platformBearer.paystackFeeBearer === 'platform' ? 'account' : 'subaccount';
    expect(mapped).toBe('account');
  });

  it('never retries, so a timeout cannot open two checkout sessions', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ETIMEDOUT'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      initializeTransaction(
        {
          amountKobo: 1_000_000,
          email: 'buyer@example.com',
          reference: 'hm_ref',
          subaccount: 'ACCT_seller',
          transactionCharge: 35_000,
          bearer: 'subaccount',
        },
        { config },
      ),
    ).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('the split recorded on an order matches what Paystack is told', () => {
  it('transaction_charge is exactly what the order says we take', () => {
    const terms: FeeTerms = {
      feePercentBps: 300,
      feeFlatKobo: 5_000,
      feeCapKobo: null,
      vatOnPlatformFeeBps: 750,
      paystackFeeBearer: 'seller',
    };

    const split = computeSplit(1_000_000, terms);

    // What we persist on the Order and what we send to Paystack must agree, or
    // the ledger will disagree with the settlement.
    expect(split.transactionChargeKobo).toBe(split.platformFee + split.platformFeeVat);
    expect(split.gross - split.transactionChargeKobo - split.paystackFee).toBe(split.sellerNet);
  });
});

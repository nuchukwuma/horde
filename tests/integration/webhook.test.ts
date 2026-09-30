/**
 * Webhook processing end to end, against real orders in a real database.
 *
 * This is where idempotency is actually proven: the unit suite shows the
 * signature gate holds, but "a redelivered charge.success does not pay twice"
 * is a claim about rows, and only rows can settle it.
 *
 * Requires MONGODB_TEST_URI. See tests/helpers/mongo.ts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { Order } from '../../src/lib/db/models/Order';
import { LedgerEntry } from '../../src/lib/db/models/LedgerEntry';
import { WebhookEvent } from '../../src/lib/db/models/WebhookEvent';
import { AuditLog } from '../../src/lib/db/models/AuditLog';
import { processPaystackEvent } from '../../src/lib/webhooks/processPaystackEvent';
import { runWithTenant, runWithoutTenantScope } from '../../src/lib/tenant/context';
import { hasMongo } from '../helpers/mongo';
import {
  chargeFailed,
  chargeSuccess,
  disputeOpened,
  refundProcessed,
  sign,
  TEST_SECRET,
  unknownEvent,
  verifyResponse,
} from '../helpers/paystackFixtures';

const siteId = new Types.ObjectId();
const tenant = { siteId: siteId.toHexString(), slug: 'ade-store' };

const ORDER_TOTAL = 1_000_000; // ₦10,000
const REFERENCE = 'hm_test_reference_001';

const paystackConfig = {
  secretKey: TEST_SECRET,
  baseUrl: 'https://api.paystack.test',
  timeoutMs: 1_000,
};

function stubVerify(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function seedOrder(overrides: Record<string, unknown> = {}) {
  return runWithTenant(tenant, () =>
    Order.create({
      orderNumber: `HM-TEST-${Math.random().toString(36).slice(2, 8)}`,
      customerEmail: 'buyer@example.com',
      items: [
        {
          productId: new Types.ObjectId(),
          title: 'Ankara Shirt',
          unitPriceKobo: ORDER_TOTAL,
          quantity: 1,
          lineTotalKobo: ORDER_TOTAL,
        },
      ],
      subtotalKobo: ORDER_TOTAL,
      totalKobo: ORDER_TOTAL,
      feeSnapshot: {
        planCode: 'pro',
        feePercentBps: 300,
        feeFlatKobo: 5_000,
        feeCapKobo: null,
        vatOnPlatformFeeBps: 0,
        paystackFeeBearer: 'seller',
      },
      split: {
        grossKobo: ORDER_TOTAL,
        platformFeeKobo: 35_000,
        platformFeeVatKobo: 0,
        paystackFeeKobo: 15_000,
        sellerNetKobo: 950_000,
      },
      status: 'pending',
      paystack: { reference: REFERENCE },
      ...overrides,
    }),
  );
}

function reload(orderId: Types.ObjectId) {
  return runWithTenant(tenant, () => Order.findById(orderId).lean());
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe.runIf(hasMongo)('charge.success marks an order paid', () => {
  beforeEach(async () => {
    await seedOrder();
  });

  it('transitions pending to paid and records Paystack detail', async () => {
    stubVerify(verifyResponse({ reference: REFERENCE, amountKobo: ORDER_TOTAL }));

    const { rawBody, signature } = sign(
      chargeSuccess({ reference: REFERENCE, amountKobo: ORDER_TOTAL }),
    );
    const result = await processPaystackEvent(
      { rawBody, signature, secretKey: TEST_SECRET },
      { config: paystackConfig },
    );

    expect(result.outcome).toBe('processed');
    expect(result.httpStatus).toBe(200);

    const order = await runWithTenant(tenant, () =>
      Order.findOne({ 'paystack.reference': REFERENCE }).lean(),
    );
    expect(order?.status).toBe('paid');
    expect(order?.paystack.transactionId).toBe('302961');
    expect(order?.paystack.amountKobo).toBe(ORDER_TOTAL);
  });

  it('writes one sale ledger entry carrying Paystack\'s reported fee', async () => {
    // Our checkout figure was an estimate; the settled fee is the truth.
    stubVerify(
      verifyResponse({ reference: REFERENCE, amountKobo: ORDER_TOTAL, feesKobo: 17_500 }),
    );

    const { rawBody, signature } = sign(
      chargeSuccess({ reference: REFERENCE, amountKobo: ORDER_TOTAL }),
    );
    await processPaystackEvent(
      { rawBody, signature, secretKey: TEST_SECRET },
      { config: paystackConfig },
    );

    const entries = await runWithTenant(tenant, () => LedgerEntry.find({}).lean());
    expect(entries).toHaveLength(1);
    expect(entries[0]?.entryType).toBe('sale');
    expect(entries[0]?.grossKobo).toBe(ORDER_TOTAL);
    expect(entries[0]?.providerFeeKobo).toBe(17_500);
    expect(entries[0]?.platformCommissionKobo).toBe(35_000);
  });

  it('verifies against Paystack rather than trusting the payload', async () => {
    const fetchMock = stubVerify(
      verifyResponse({ reference: REFERENCE, amountKobo: ORDER_TOTAL }),
    );

    const { rawBody, signature } = sign(
      chargeSuccess({ reference: REFERENCE, amountKobo: ORDER_TOTAL }),
    );
    await processPaystackEvent(
      { rawBody, signature, secretKey: TEST_SECRET },
      { config: paystackConfig },
    );

    expect(fetchMock).toHaveBeenCalled();
    expect(String(fetchMock.mock.calls[0][0])).toContain(`/transaction/verify/${REFERENCE}`);
  });
});

describe.runIf(hasMongo)('idempotency — Paystack retries are harmless', () => {
  beforeEach(async () => {
    await seedOrder();
  });

  it('a redelivered charge.success does not pay twice', async () => {
    stubVerify(verifyResponse({ reference: REFERENCE, amountKobo: ORDER_TOTAL }));

    const signed = sign(chargeSuccess({ reference: REFERENCE, amountKobo: ORDER_TOTAL }));

    const first = await processPaystackEvent(
      { ...signed, secretKey: TEST_SECRET },
      { config: paystackConfig },
    );
    const second = await processPaystackEvent(
      { ...signed, secretKey: TEST_SECRET },
      { config: paystackConfig },
    );

    expect(first.outcome).toBe('processed');
    expect(second.outcome).toBe('duplicate');

    // The money was recorded exactly once.
    const entries = await runWithTenant(tenant, () => LedgerEntry.countDocuments({}));
    expect(entries).toBe(1);
  });

  it('records the event once however many times it arrives', async () => {
    stubVerify(verifyResponse({ reference: REFERENCE, amountKobo: ORDER_TOTAL }));
    const signed = sign(chargeSuccess({ reference: REFERENCE, amountKobo: ORDER_TOTAL }));

    for (let i = 0; i < 4; i += 1) {
      await processPaystackEvent(
        { ...signed, secretKey: TEST_SECRET },
        { config: paystackConfig },
      );
    }

    const events = await runWithoutTenantScope('inspecting webhook records in a test', () =>
      WebhookEvent.find({}).lean(),
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.attempts).toBeGreaterThan(1);
    expect(events[0]?.status).toBe('processed');
  });

  it('survives concurrent redelivery of the same event', async () => {
    stubVerify(verifyResponse({ reference: REFERENCE, amountKobo: ORDER_TOTAL }));
    const signed = sign(chargeSuccess({ reference: REFERENCE, amountKobo: ORDER_TOTAL }));

    await Promise.all(
      Array.from({ length: 5 }, () =>
        processPaystackEvent({ ...signed, secretKey: TEST_SECRET }, { config: paystackConfig }),
      ),
    );

    const entries = await runWithTenant(tenant, () => LedgerEntry.countDocuments({}));
    expect(entries).toBeLessThanOrEqual(1);
  });

  it('treats a dispute on an already-charged transaction as a new event', async () => {
    stubVerify(verifyResponse({ reference: REFERENCE, amountKobo: ORDER_TOTAL }));

    const charge = sign(chargeSuccess({ reference: REFERENCE, amountKobo: ORDER_TOTAL }));
    await processPaystackEvent({ ...charge, secretKey: TEST_SECRET }, { config: paystackConfig });

    const dispute = sign(disputeOpened({ reference: REFERENCE }));
    const result = await processPaystackEvent(
      { ...dispute, secretKey: TEST_SECRET },
      { config: paystackConfig },
    );

    // Keying on the transaction alone would have called this a duplicate.
    expect(result.outcome).not.toBe('duplicate');

    const order = await runWithTenant(tenant, () =>
      Order.findOne({ 'paystack.reference': REFERENCE }).lean(),
    );
    expect(order?.status).toBe('disputed');
  });
});

describe.runIf(hasMongo)('an amount that disagrees is never marked paid', () => {
  beforeEach(async () => {
    await seedOrder();
  });

  it('refuses when Paystack reports a different amount', async () => {
    stubVerify(verifyResponse({ reference: REFERENCE, amountKobo: 100 }));

    const { rawBody, signature } = sign(
      chargeSuccess({ reference: REFERENCE, amountKobo: ORDER_TOTAL }),
    );
    const result = await processPaystackEvent(
      { rawBody, signature, secretKey: TEST_SECRET },
      { config: paystackConfig },
    );

    expect(result.outcome).toBe('amount_mismatch');

    const order = await runWithTenant(tenant, () =>
      Order.findOne({ 'paystack.reference': REFERENCE }).lean(),
    );
    expect(order?.status).toBe('pending');

    const entries = await runWithTenant(tenant, () => LedgerEntry.countDocuments({}));
    expect(entries).toBe(0);
  });

  it('refuses when the currency differs', async () => {
    stubVerify(
      verifyResponse({ reference: REFERENCE, amountKobo: ORDER_TOTAL, currency: 'USD' }),
    );

    const { rawBody, signature } = sign(
      chargeSuccess({ reference: REFERENCE, amountKobo: ORDER_TOTAL }),
    );
    const result = await processPaystackEvent(
      { rawBody, signature, secretKey: TEST_SECRET },
      { config: paystackConfig },
    );

    expect(result.outcome).toBe('amount_mismatch');
  });

  it('leaves an audit record a human can find', async () => {
    stubVerify(verifyResponse({ reference: REFERENCE, amountKobo: 100 }));

    const { rawBody, signature } = sign(
      chargeSuccess({ reference: REFERENCE, amountKobo: ORDER_TOTAL }),
    );
    await processPaystackEvent(
      { rawBody, signature, secretKey: TEST_SECRET },
      { config: paystackConfig },
    );

    const logs = await AuditLog.find({ action: 'webhook.amount_mismatch' }).lean();
    expect(logs).toHaveLength(1);
    expect(logs[0]?.before).toMatchObject({ expectedKobo: ORDER_TOTAL });
  });

  it('does not mark paid when Paystack says the charge did not succeed', async () => {
    stubVerify(
      verifyResponse({ reference: REFERENCE, amountKobo: ORDER_TOTAL, status: 'abandoned' }),
    );

    const { rawBody, signature } = sign(
      chargeSuccess({ reference: REFERENCE, amountKobo: ORDER_TOTAL }),
    );
    const result = await processPaystackEvent(
      { rawBody, signature, secretKey: TEST_SECRET },
      { config: paystackConfig },
    );

    expect(result.outcome).toBe('ignored');

    // Re-read the order beforeEach created. An earlier version of this line
    // called seedOrder() again, which both tripped the unique index on
    // paystack.reference and asserted nothing: a freshly created order is
    // 'pending' whatever the webhook did.
    const order = await runWithTenant(tenant, () =>
      Order.findOne({ 'paystack.reference': REFERENCE }).lean(),
    );
    expect(order?.status).toBe('pending');
  });
});

describe.runIf(hasMongo)('other event types', () => {
  it('marks a pending order failed on charge.failed', async () => {
    const order = await seedOrder();

    const { rawBody, signature } = sign(
      chargeFailed({ reference: REFERENCE, amountKobo: ORDER_TOTAL }),
    );
    await processPaystackEvent(
      { rawBody, signature, secretKey: TEST_SECRET },
      { config: paystackConfig },
    );

    expect((await reload(order._id))?.status).toBe('failed');
  });

  it('does not drag a paid order backwards on a late charge.failed', async () => {
    const order = await seedOrder({ status: 'paid' });

    const { rawBody, signature } = sign(
      chargeFailed({ reference: REFERENCE, amountKobo: ORDER_TOTAL }),
    );
    await processPaystackEvent(
      { rawBody, signature, secretKey: TEST_SECRET },
      { config: paystackConfig },
    );

    expect((await reload(order._id))?.status).toBe('paid');
  });

  it('marks a paid order refunded on refund.processed', async () => {
    const order = await seedOrder({ status: 'paid' });

    // Refund payloads nest the reference under `transaction`.
    const { rawBody, signature } = sign(
      refundProcessed({ reference: REFERENCE, amountKobo: ORDER_TOTAL }),
    );
    const result = await processPaystackEvent(
      { rawBody, signature, secretKey: TEST_SECRET },
      { config: paystackConfig },
    );

    expect(result.outcome).toBe('processed');
    expect((await reload(order._id))?.status).toBe('refunded');
  });

  it('records an unknown event type instead of dropping it', async () => {
    const { rawBody, signature } = sign(unknownEvent());
    const result = await processPaystackEvent(
      { rawBody, signature, secretKey: TEST_SECRET },
      { config: paystackConfig },
    );

    expect(result.outcome).toBe('ignored');
    expect(result.httpStatus).toBe(200);

    const events = await runWithoutTenantScope('inspecting webhook records in a test', () =>
      WebhookEvent.find({ eventType: 'subscription.create' }).lean(),
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.status).toBe('ignored');
  });

  it('accepts a charge for a reference we have never seen', async () => {
    // Not ours, or ours and lost. Either way a retry will not help, so 200.
    const { rawBody, signature } = sign(
      chargeSuccess({ reference: 'hm_unknown_reference', amountKobo: 1_000 }),
    );
    const result = await processPaystackEvent(
      { rawBody, signature, secretKey: TEST_SECRET },
      { config: paystackConfig },
    );

    expect(result.outcome).toBe('order_not_found');
    expect(result.httpStatus).toBe(200);
  });
});

describe.runIf(hasMongo)('transient failures ask Paystack to redeliver', () => {
  it('answers 500 when the verify call fails, and retries succeed later', async () => {
    const order = await seedOrder();

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));

    const signed = sign(chargeSuccess({ reference: REFERENCE, amountKobo: ORDER_TOTAL }));
    const first = await processPaystackEvent(
      { ...signed, secretKey: TEST_SECRET },
      { config: paystackConfig },
    );

    expect(first.outcome).toBe('failed');
    expect(first.httpStatus).toBe(500);
    expect((await reload(order._id))?.status).toBe('pending');

    // Paystack redelivers; this time the verify call works. A failed event must
    // not be skipped as a duplicate.
    stubVerify(verifyResponse({ reference: REFERENCE, amountKobo: ORDER_TOTAL }));
    const second = await processPaystackEvent(
      { ...signed, secretKey: TEST_SECRET },
      { config: paystackConfig },
    );

    expect(second.outcome).toBe('processed');
    expect((await reload(order._id))?.status).toBe('paid');
  });
});

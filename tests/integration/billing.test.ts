/**
 * Content quotas and Premium billing against a real database, with Paystack
 * stubbed at fetch.
 *
 * Requires MONGODB_TEST_URI. See tests/helpers/mongo.ts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { Site, type SiteDocument } from '../../src/lib/db/models/Site';
import { Product } from '../../src/lib/db/models/Product';
import { runWithoutTenantScope } from '../../src/lib/tenant/context';
import { withSite } from '../../src/lib/tenant/loadSite';
import { assertImageCount, assertQuota, QuotaExceededError } from '../../src/lib/billing/quota';
import { processPaystackEvent } from '../../src/lib/webhooks/processPaystackEvent';
import { TIERS } from '../../src/config/plans';
import { chargeSuccess, sign, TEST_SECRET, verifyResponse } from '../helpers/paystackFixtures';
import { hasMongo } from '../helpers/mongo';

const paystackConfig = { secretKey: TEST_SECRET, baseUrl: 'https://api.paystack.test', timeoutMs: 1_000 };

async function makeSite(slug: string, extra: Record<string, unknown> = {}): Promise<SiteDocument> {
  return runWithoutTenantScope('creating a test Site, which is the tenant root', () =>
    Site.create({ slug, name: `Store ${slug}`, ownerId: new Types.ObjectId(), ...extra }),
  ) as Promise<SiteDocument>;
}

async function reload(site: SiteDocument): Promise<SiteDocument> {
  return (await runWithoutTenantScope('reading a test Site', () => Site.findById(site._id))) as SiteDocument;
}

function stubVerify(body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })));
}

afterEach(() => vi.unstubAllGlobals());

describe.runIf(hasMongo)('content quotas', () => {
  it('stops a Free store at its product limit and lets Premium carry on', async () => {
    const free = await makeSite('quota-free');
    await withSite(free, () =>
      Product.insertMany(
        Array.from({ length: TIERS.free.limits.products }, (_, i) => ({
          siteId: free._id,
          title: `P${i}`,
          slug: `p-${i}`,
          priceKobo: 100_000,
        })),
      ),
    );
    await expect(withSite(free, () => assertQuota(free, 'products'))).rejects.toThrow(QuotaExceededError);

    const pro = await makeSite('quota-pro', { planCode: 'pro' });
    await withSite(pro, () =>
      Product.insertMany(Array.from({ length: TIERS.free.limits.products }, (_, i) => ({ siteId: pro._id, title: `P${i}`, slug: `p-${i}`, priceKobo: 100_000 }))),
    );
    await expect(withSite(pro, () => assertQuota(pro, 'products'))).resolves.toBeUndefined();
  });

  it('counts only this store, and archived products free a slot', async () => {
    const mine = await makeSite('quota-mine');
    const other = await makeSite('quota-other');
    await withSite(other, () =>
      Product.insertMany(Array.from({ length: TIERS.free.limits.products }, (_, i) => ({ siteId: other._id, title: `O${i}`, slug: `o-${i}`, priceKobo: 100_000 }))),
    );
    await expect(withSite(mine, () => assertQuota(mine, 'products'))).resolves.toBeUndefined();

    await withSite(other, () => Product.updateOne({ slug: 'o-0' }, { $set: { status: 'archived' } }));
    await expect(withSite(other, () => assertQuota(other, 'products'))).resolves.toBeUndefined();
  });

  it('limits photos per product by plan', () => {
    expect(() => assertImageCount({ planCode: 'free' }, TIERS.free.limits.imagesPerProduct + 1)).toThrow(QuotaExceededError);
    expect(() => assertImageCount({ planCode: 'pro' }, TIERS.free.limits.imagesPerProduct + 1)).not.toThrow();
  });
});

describe.runIf(hasMongo)('Premium billing', () => {
  const reference = 'hmsub_0123456789abcdef0123456789abcdef';
  let site: SiteDocument;

  beforeEach(async () => {
    site = await makeSite('billing-store', { subscription: { status: 'pending', pendingReference: reference } });
  });

  it('upgrades the store that owns the reference once Paystack confirms the payment', async () => {
    stubVerify(verifyResponse({ reference, amountKobo: TIERS.pro.priceKobo }));
    const signed = sign(chargeSuccess({ reference, amountKobo: TIERS.pro.priceKobo }));

    const result = await processPaystackEvent({ ...signed, secretKey: TEST_SECRET }, { config: paystackConfig });
    expect(result.outcome).toBe('processed');

    const after = await reload(site);
    expect(after.planCode).toBe('pro');
    expect(after.subscription.status).toBe('active');
  });

  it('refuses a payment below the Premium price', async () => {
    stubVerify(verifyResponse({ reference, amountKobo: TIERS.pro.priceKobo - 1 }));
    const signed = sign(chargeSuccess({ reference, amountKobo: TIERS.pro.priceKobo - 1 }));

    const result = await processPaystackEvent({ ...signed, secretKey: TEST_SECRET }, { config: paystackConfig });
    expect(result.outcome).toBe('amount_mismatch');
    expect((await reload(site)).planCode).toBe('free');
  });

  it('ignores a subscription reference no store was issued', async () => {
    const stranger = 'hmsub_ffffffffffffffffffffffffffffffff';
    stubVerify(verifyResponse({ reference: stranger, amountKobo: TIERS.pro.priceKobo }));
    const signed = sign(chargeSuccess({ reference: stranger, amountKobo: TIERS.pro.priceKobo }));

    const result = await processPaystackEvent({ ...signed, secretKey: TEST_SECRET }, { config: paystackConfig });
    expect(result.outcome).toBe('ignored');
    expect((await reload(site)).planCode).toBe('free');
  });

  it('drops back to Free when Paystack disables the subscription', async () => {
    await runWithoutTenantScope('setting up a Premium test Site', () =>
      Site.updateOne({ _id: site._id }, { $set: { planCode: 'pro', 'subscription.status': 'active', 'subscription.paystackSubscriptionCode': 'SUB_test123' } }),
    );
    const signed = sign({ event: 'subscription.disable', data: { id: 99, subscription_code: 'SUB_test123', status: 'complete' } });

    await processPaystackEvent({ ...signed, secretKey: TEST_SECRET }, { config: paystackConfig });
    const after = await reload(site);
    expect(after.planCode).toBe('free');
    expect(after.subscription.status).toBe('cancelled');
  });
});

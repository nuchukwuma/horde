/**
 * Sales to MrMouse are kept and retried until MrMouse confirms them, and a
 * stock count from MrMouse that cannot include them yet does not put sold
 * items back on the shelf.
 *
 * Requires MONGODB_TEST_URI. See tests/helpers/mongo.ts.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { User } from '../../src/lib/db/models/User';
import { Site } from '../../src/lib/db/models/Site';
import { Product } from '../../src/lib/db/models/Product';
import { MrMouseSaleDelivery } from '../../src/lib/db/models/MrMouseSaleDelivery';
import { hashPassword } from '../../src/lib/auth/password';
import { runWithTenant, runWithoutTenantScope } from '../../src/lib/tenant/context';
import { mrmouseConfig, verifyBodySignature } from '../../src/lib/integrations/mrmouse';
import { applyMrMouseStock, changeMrMouseConnection } from '../../src/lib/integrations/mrmouseService';
import {
  RETRY_DELAYS_MS,
  mrmouseSaleBacklog,
  queueMrMouseSale,
  retryDueMrMouseSales,
  retryFailedMrMouseSales,
} from '../../src/lib/integrations/mrmouseSales';
import { hasMongo } from '../helpers/mongo';

const SECRET = 'k'.repeat(40);
const config = mrmouseConfig({
  MRMOUSE_WEB_URL: 'https://app.mrmouse.test',
  MRMOUSE_SSO_SECRET: SECRET,
  MRMOUSE_API_URL: 'https://api.mrmouse.test',
  MRMOUSE_WEBHOOK_SECRET: SECRET,
});

/** A MrMouse that answers with the given statuses in turn (0 = unreachable). */
function mrmouse(...statuses: number[]) {
  const sent: { url: string; body: string; signature: string }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const headers = init.headers as Record<string, string>;
    sent.push({ url, body: String(init.body), signature: headers['X-HordeMart-Signature'] });
    const status = statuses.length > 1 ? statuses.shift()! : statuses[0];
    if (status === 0) throw new Error('ECONNREFUSED');
    return new Response('{}', { status });
  }) as unknown as typeof fetch;
  return { fetchImpl, sent };
}

async function connectedStore(slug: string) {
  const owner = await User.create({
    email: `${slug}@example.com`,
    name: 'Owner',
    passwordHash: await hashPassword('correct-horse-battery'),
    emailVerifiedAt: new Date(),
  });
  const site = await runWithoutTenantScope('test fixture: creating a Site', () =>
    Site.create({ slug, name: `Store ${slug}`, ownerId: owner._id, planCode: 'free' }),
  );
  await changeMrMouseConnection(site._id, { connect: true, acceptTerms: true, stockSync: true }, { userId: owner._id }, config);
  const reload = async () => (await runWithoutTenantScope('test: reading the Site back', () => Site.findById(site._id)))!;
  return { site, reload, tenant: { siteId: String(site._id), slug } };
}

const sale = (siteId: Types.ObjectId, orderNumber: string, items = [{ sku: 'S-1', quantity: 2 }]) => ({
  siteId,
  orderId: new Types.ObjectId(),
  orderNumber,
  paidAt: new Date('2026-10-02T09:00:00Z'),
  items,
});

const row = (tenant: { siteId: string }, orderNumber: string) =>
  runWithTenant(tenant, () => MrMouseSaleDelivery.findOne({ orderNumber }).lean());

describe.runIf(hasMongo)('sales to MrMouse', () => {
  it('sends at once, signed, with only SKUs and quantities', async () => {
    const { site, tenant } = await connectedStore('sale-ok');
    const mm = mrmouse(200);
    await queueMrMouseSale(sale(site._id, 'HM-1'), { config, fetchImpl: mm.fetchImpl });

    expect(mm.sent).toHaveLength(1);
    expect(mm.sent[0].url).toBe('https://api.mrmouse.test/integrations/hordemart/sales');
    expect(verifyBodySignature(mm.sent[0].body, mm.sent[0].signature, SECRET)).toBe(true);
    expect(JSON.parse(mm.sent[0].body)).toEqual({
      event: 'order.paid',
      siteId: String(site._id),
      orderNumber: 'HM-1',
      paidAt: '2026-10-02T09:00:00.000Z',
      items: [{ sku: 'S-1', quantity: 2 }],
    });
    expect(await row(tenant, 'HM-1')).toMatchObject({ status: 'delivered', attempts: 1, lastStatus: 200 });
  });

  it('keeps an unconfirmed sale and retries it later, freshly signed', async () => {
    const { site, tenant } = await connectedStore('sale-retry');
    const start = new Date('2026-10-02T10:00:00Z');
    const mm = mrmouse(0, 500, 200);
    await queueMrMouseSale(sale(site._id, 'HM-2'), { config, fetchImpl: mm.fetchImpl, now: start });
    expect(await row(tenant, 'HM-2')).toMatchObject({ status: 'pending', attempts: 1, lastStatus: 0 });

    // Not due yet: nothing sent.
    await retryDueMrMouseSales({ config, fetchImpl: mm.fetchImpl, now: new Date(start.getTime() + 30_000), siteId: site._id });
    expect(mm.sent).toHaveLength(1);

    const second = new Date(start.getTime() + RETRY_DELAYS_MS[0]);
    await retryDueMrMouseSales({ config, fetchImpl: mm.fetchImpl, now: second, siteId: site._id });
    expect(await row(tenant, 'HM-2')).toMatchObject({ status: 'pending', attempts: 2, lastStatus: 500 });

    const third = new Date(second.getTime() + RETRY_DELAYS_MS[1]);
    await retryDueMrMouseSales({ config, fetchImpl: mm.fetchImpl, now: third });
    expect(await row(tenant, 'HM-2')).toMatchObject({ status: 'delivered', attempts: 3 });
    // Each attempt carries its own timestamp, inside MrMouse's five-minute window.
    expect(verifyBodySignature(mm.sent[2].body, mm.sent[2].signature, SECRET, third.getTime())).toBe(true);
  });

  it('gives up after the last retry, tells the owner, and can be tried again', async () => {
    const { site, tenant } = await connectedStore('sale-fail');
    const mm = mrmouse(503);
    let now = new Date('2026-10-02T10:00:00Z');
    await queueMrMouseSale(sale(site._id, 'HM-3'), { config, fetchImpl: mm.fetchImpl, now });
    for (const delay of RETRY_DELAYS_MS) {
      now = new Date(now.getTime() + delay);
      await retryDueMrMouseSales({ config, fetchImpl: mm.fetchImpl, now, siteId: site._id });
    }
    expect(mm.sent).toHaveLength(RETRY_DELAYS_MS.length + 1);
    expect(await row(tenant, 'HM-3')).toMatchObject({ status: 'failed' });
    expect(await mrmouseSaleBacklog(site._id)).toEqual({ pending: 0, failed: 1, failedOrders: ['HM-3'] });

    await retryFailedMrMouseSales(site._id, { config, fetchImpl: mrmouse(200).fetchImpl, now });
    expect(await row(tenant, 'HM-3')).toMatchObject({ status: 'delivered' });
  });

  it('queues one message per order, however often the payment webhook arrives', async () => {
    const { site, tenant } = await connectedStore('sale-dupe');
    const mm = mrmouse(0);
    const first = sale(site._id, 'HM-4');
    await queueMrMouseSale(first, { config, fetchImpl: mm.fetchImpl });
    await queueMrMouseSale(first, { config, fetchImpl: mm.fetchImpl });
    expect(await runWithTenant(tenant, () => MrMouseSaleDelivery.countDocuments({ orderNumber: 'HM-4' }))).toBe(1);
  });

  it('a store-scoped retry never sends another store’s sales', async () => {
    const a = await connectedStore('sale-a');
    const b = await connectedStore('sale-b');
    await queueMrMouseSale(sale(a.site._id, 'HM-A'), { config, fetchImpl: mrmouse(0).fetchImpl });
    await queueMrMouseSale(sale(b.site._id, 'HM-B'), { config, fetchImpl: mrmouse(0).fetchImpl });
    const mm = mrmouse(200);
    await retryDueMrMouseSales({ config, fetchImpl: mm.fetchImpl, now: new Date(Date.now() + 120_000), siteId: a.site._id });
    expect(mm.sent.map((s) => JSON.parse(s.body).orderNumber)).toEqual(['HM-A']);
    expect(await row(b.tenant, 'HM-B')).toMatchObject({ status: 'pending' });
  });

  it('a MrMouse count that cannot include a sale yet does not undo it', async () => {
    const { site, tenant, reload } = await connectedStore('sale-stock');
    await runWithTenant(tenant, () =>
      Product.create({ title: 'Shirt', slug: 'shirt', priceKobo: 500_000, sku: 'S-1', status: 'active', inventory: { track: true, quantity: 8, policy: 'deny' } }),
    );
    const quantity = async () => (await runWithTenant(tenant, () => Product.findOne({ sku: 'S-1' }).lean()))!.inventory.quantity;

    // Sold 2 here (8 left); MrMouse has not heard yet and still counts 10.
    const paid = new Date('2026-10-02T10:00:00Z');
    await queueMrMouseSale(sale(site._id, 'HM-5'), { config, fetchImpl: mrmouse(0).fetchImpl, now: paid });
    await applyMrMouseStock(await reload(), [{ sku: 'S-1', quantity: 10 }], new Date('2026-10-02T10:01:00Z'));
    expect(await quantity()).toBe(8);

    // Delivered at 10:05. A count MrMouse took at 10:03 still can't include it…
    await retryDueMrMouseSales({ config, fetchImpl: mrmouse(200).fetchImpl, now: new Date('2026-10-02T10:05:00Z'), siteId: site._id });
    await applyMrMouseStock(await reload(), [{ sku: 'S-1', quantity: 10 }], new Date('2026-10-02T10:03:00Z'));
    expect(await quantity()).toBe(8);

    // …one taken after it does, and is used as sent.
    await applyMrMouseStock(await reload(), [{ sku: 'S-1', quantity: 8 }], new Date('2026-10-02T10:06:00Z'));
    expect(await quantity()).toBe(8);
    await applyMrMouseStock(await reload(), [{ sku: 'S-1', quantity: 15 }], new Date('2026-10-02T10:07:00Z'));
    expect(await quantity()).toBe(15);
  });
});

describe.runIf(hasMongo)('GET /api/cron/mrmouse-sales', () => {
  afterEach(() => vi.unstubAllEnvs());

  async function call(secret: string | null, authorization?: string) {
    if (secret !== null) vi.stubEnv('CRON_SECRET', secret);
    vi.stubEnv('MONGODB_URI', process.env.MONGODB_TEST_URI as string);
    const { GET } = await import('../../src/app/api/cron/mrmouse-sales/route');
    return GET(
      new NextRequest('https://app.hordemart.test/api/cron/mrmouse-sales', {
        headers: authorization ? { authorization } : {},
      }),
    );
  }

  it('does not exist without CRON_SECRET, and needs the right one', async () => {
    vi.stubEnv('CRON_SECRET', '');
    expect((await call(null, 'Bearer anything')).status).toBe(404);
    const secret = 'c'.repeat(40);
    expect((await call(secret)).status).toBe(401);
    expect((await call(secret, `Bearer ${'d'.repeat(40)}`)).status).toBe(401);
    expect((await call(secret, `Bearer ${secret}`)).status).toBe(200);
  });
});

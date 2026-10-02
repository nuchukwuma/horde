/**
 * MrMouse connection, sign-in passes and stock sync against a real database.
 *
 * Requires MONGODB_TEST_URI. See tests/helpers/mongo.ts.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { User } from '../../src/lib/db/models/User';
import { Site } from '../../src/lib/db/models/Site';
import { Product } from '../../src/lib/db/models/Product';
import { AuditLog } from '../../src/lib/db/models/AuditLog';
import { hashPassword } from '../../src/lib/auth/password';
import { runWithTenant, runWithoutTenantScope } from '../../src/lib/tenant/context';
import { mrmouseConfig, signBody, verifyHandoffToken } from '../../src/lib/integrations/mrmouse';
import { applyMrMouseStock, changeMrMouseConnection, issueMrMouseLaunch } from '../../src/lib/integrations/mrmouseService';
import { hasMongo } from '../helpers/mongo';

const SECRET = 'k'.repeat(40);
const config = mrmouseConfig({
  MRMOUSE_WEB_URL: 'https://app.mrmouse.test',
  MRMOUSE_SSO_SECRET: SECRET,
  MRMOUSE_API_URL: 'https://api.mrmouse.test',
  MRMOUSE_WEBHOOK_SECRET: SECRET,
});

async function setup(slug: string, verified = true) {
  const owner = await User.create({
    email: `${slug}@example.com`,
    name: 'Owner',
    passwordHash: await hashPassword('correct-horse-battery'),
    emailVerifiedAt: verified ? new Date() : null,
  });
  const site = await runWithoutTenantScope('test fixture: creating a Site', () =>
    Site.create({ slug, name: `Store ${slug}`, ownerId: owner._id, planCode: 'free' }),
  );
  const session = { sessionId: new Types.ObjectId(), user: owner, scope: 'platform' as const, reauthenticatedAt: new Date() };
  const reload = () => runWithoutTenantScope('test: reading the Site back', () => Site.findById(site._id)) as Promise<NonNullable<Awaited<ReturnType<typeof Site.findById>>>>;
  return { owner, site, session, reload };
}

function product(tenant: { siteId: string; slug: string }, sku: string, quantity = 0) {
  return runWithTenant(tenant, () =>
    Product.create({ title: `P ${sku}`, slug: `p-${sku.toLowerCase()}`, priceKobo: 500_000, sku, status: 'active', inventory: { track: false, quantity, policy: 'deny' } }),
  );
}

describe.runIf(hasMongo)('MrMouse connection', () => {
  it('needs the owner’s consent before any sign-in pass, and records it', async () => {
    const { site, session, owner, reload } = await setup('consent-store');
    await expect(issueMrMouseLaunch(session, (await reload())!, 'owner', {}, config)).rejects.toThrow(/not connected/);

    await changeMrMouseConnection(site._id, { connect: true, acceptTerms: true }, { userId: owner._id }, config);
    const { url } = await issueMrMouseLaunch(session, (await reload())!, 'owner', {}, config);
    const token = new URL(url).hash.replace('#token=', '');
    expect(verifyHandoffToken(token, SECRET)).toMatchObject({ sub: String(owner._id), email: 'consent-store@example.com', site: { slug: 'consent-store' } });

    const actions = await runWithoutTenantScope('test: reading the audit log', () =>
      AuditLog.find({ targetId: String(site._id) }).sort({ createdAt: 1 }).lean(),
    );
    expect(actions.map((entry) => entry.action)).toEqual(['integration.mrmouse.connected', 'integration.mrmouse.launched']);
  });

  it('never vouches for an unconfirmed email', async () => {
    const { site, session, owner, reload } = await setup('unverified-store', false);
    await changeMrMouseConnection(site._id, { connect: true, acceptTerms: true }, { userId: owner._id }, config);
    await expect(issueMrMouseLaunch(session, (await reload())!, 'owner', {}, config)).rejects.toThrow(/not verified/);
  });

  it('turns stock sync off when disconnected, and refuses it while disconnected', async () => {
    const { site, owner } = await setup('sync-store');
    await expect(changeMrMouseConnection(site._id, { stockSync: true }, { userId: owner._id }, config)).rejects.toThrow(/Connect MrMouse first/);
    await changeMrMouseConnection(site._id, { connect: true, acceptTerms: true, stockSync: true }, { userId: owner._id }, config);
    const off = await changeMrMouseConnection(site._id, { connect: false }, { userId: owner._id }, config);
    expect(off).toMatchObject({ connected: false, stockSync: false });
  });
});

describe.runIf(hasMongo)('MrMouse stock sync', () => {
  it('sets quantities by SKU, switches tracking on, and never touches price', async () => {
    const { site, owner, reload } = await setup('stock-store');
    const tenant = { siteId: String(site._id), slug: site.slug };
    await product(tenant, 'ADIRE-1');
    await changeMrMouseConnection(site._id, { connect: true, acceptTerms: true, stockSync: true }, { userId: owner._id }, config);

    const result = await applyMrMouseStock((await reload())!, [{ sku: 'ADIRE-1', quantity: 7 }, { sku: 'NOPE', quantity: 1 }], new Date());
    expect(result).toEqual({ updated: 1, unknownSkus: ['NOPE'], stale: 0 });
    const stored = await runWithTenant(tenant, () => Product.findOne({ sku: 'ADIRE-1' }).lean());
    expect(stored?.inventory).toMatchObject({ quantity: 7, track: true });
    expect(stored?.priceKobo).toBe(500_000);
  });

  it('ignores an older or replayed message', async () => {
    const { site, owner, reload } = await setup('stale-store');
    const tenant = { siteId: String(site._id), slug: site.slug };
    await product(tenant, 'SKU-1');
    await changeMrMouseConnection(site._id, { connect: true, acceptTerms: true, stockSync: true }, { userId: owner._id }, config);
    const newer = new Date();
    await applyMrMouseStock((await reload())!, [{ sku: 'SKU-1', quantity: 2 }], newer);
    const replay = await applyMrMouseStock((await reload())!, [{ sku: 'SKU-1', quantity: 50 }], new Date(newer.getTime() - 60_000));
    expect(replay).toMatchObject({ updated: 0, stale: 1 });
    expect((await runWithTenant(tenant, () => Product.findOne({ sku: 'SKU-1' }).lean()))?.inventory.quantity).toBe(2);
  });

  it('refuses when the store has not switched stock sync on', async () => {
    const { reload } = await setup('off-store');
    await expect(applyMrMouseStock((await reload())!, [{ sku: 'A', quantity: 1 }], new Date())).rejects.toThrow(/off/);
  });

  it('only ever touches the named store’s products', async () => {
    const a = await setup('iso-a');
    const b = await setup('iso-b');
    await product({ siteId: String(a.site._id), slug: 'iso-a' }, 'SHARED', 1);
    await product({ siteId: String(b.site._id), slug: 'iso-b' }, 'SHARED', 1);
    await changeMrMouseConnection(a.site._id, { connect: true, acceptTerms: true, stockSync: true }, { userId: a.owner._id }, config);
    await applyMrMouseStock((await a.reload())!, [{ sku: 'SHARED', quantity: 99 }], new Date());
    const other = await runWithTenant({ siteId: String(b.site._id), slug: 'iso-b' }, () => Product.findOne({ sku: 'SHARED' }).lean());
    expect(other?.inventory.quantity).toBe(1);
  });
});

describe.runIf(hasMongo)('POST /api/integrations/mrmouse/inventory', () => {
  afterEach(() => vi.unstubAllEnvs());

  async function call(body: unknown, sign: (raw: string) => string | null) {
    vi.stubEnv('MRMOUSE_API_URL', 'https://api.mrmouse.test');
    vi.stubEnv('MRMOUSE_WEBHOOK_SECRET', SECRET);
    vi.stubEnv('MONGODB_URI', process.env.MONGODB_TEST_URI as string);
    const { POST } = await import('../../src/app/api/integrations/mrmouse/inventory/route');
    const raw = JSON.stringify(body);
    const signature = sign(raw);
    const request = new NextRequest('https://app.hordemart.test/api/integrations/mrmouse/inventory', {
      method: 'POST',
      body: raw,
      headers: { 'Content-Type': 'application/json', ...(signature ? { 'X-MrMouse-Signature': signature } : {}) },
    });
    return POST(request);
  }

  it('applies a correctly signed message for a store that switched sync on', async () => {
    const { site, owner } = await setup('route-store');
    await product({ siteId: String(site._id), slug: 'route-store' }, 'R-1');
    await changeMrMouseConnection(site._id, { connect: true, acceptTerms: true, stockSync: true }, { userId: owner._id }, config);
    const body = { siteId: String(site._id), sentAt: new Date().toISOString(), items: [{ sku: 'R-1', quantity: 4 }] };
    const response = await call(body, (raw) => signBody(raw, SECRET));
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ updated: 1 });
  });

  it('rejects an unsigned or wrongly signed message before reading it', async () => {
    const body = { siteId: new Types.ObjectId().toHexString(), sentAt: new Date().toISOString(), items: [{ sku: 'X', quantity: 1 }] };
    expect((await call(body, () => null)).status).toBe(401);
    expect((await call(body, (raw) => signBody(raw, 'w'.repeat(40)))).status).toBe(401);
  });

  it('refuses a store that has not switched sync on, and a price smuggled in is ignored', async () => {
    const { site } = await setup('route-off');
    const body = { siteId: String(site._id), sentAt: new Date().toISOString(), items: [{ sku: 'X', quantity: 1, priceKobo: 1 }] };
    expect((await call(body, (raw) => signBody(raw, SECRET))).status).toBe(409);
  });
});

describe.runIf(hasMongo)('MrMouse connection terms', () => {
  it('refuses to connect without the terms ticked, and records the version accepted', async () => {
    const { site, owner, reload } = await setup('terms-store');
    await expect(changeMrMouseConnection(site._id, { connect: true }, { userId: owner._id }, config)).rejects.toThrow(/connection terms/);
    await changeMrMouseConnection(site._id, { connect: true, acceptTerms: true }, { userId: owner._id }, config);
    const { MRMOUSE_TERMS_VERSION } = await import('../../src/lib/legal/terms');
    expect((await reload())?.integrations?.mrmouse?.termsVersion).toBe(MRMOUSE_TERMS_VERSION);
  });

  it('pauses sign-in and stock sync when the terms change, until accepted again', async () => {
    const { site, owner, session, reload } = await setup('outdated-store');
    await changeMrMouseConnection(site._id, { connect: true, acceptTerms: true, stockSync: true }, { userId: owner._id }, config);
    // Simulate a new terms version by aging the accepted one.
    await runWithoutTenantScope('test: aging the accepted terms version', () =>
      Site.updateOne({ _id: site._id }, { $set: { 'integrations.mrmouse.termsVersion': '2000-01-01' } }),
    );
    const { mrmouseState } = await import('../../src/lib/integrations/mrmouseService');
    expect(mrmouseState((await reload())!)).toMatchObject({ connected: false, termsOutdated: true, stockSync: false });
    await expect(issueMrMouseLaunch(session, (await reload())!, 'owner', {}, config)).rejects.toThrow(/not connected/);

    await changeMrMouseConnection(site._id, { connect: true, acceptTerms: true }, { userId: owner._id }, config);
    expect(mrmouseState((await reload())!)).toMatchObject({ connected: true, termsOutdated: false });
  });
});

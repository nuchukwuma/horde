/**
 * PATCH /api/sites/:id/modules — the owner switches Blog and Portfolio on or
 * off, within what the plan allows. Nobody else can, a platform admin included.
 *
 * Requires MONGODB_TEST_URI. See tests/helpers/mongo.ts.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { User } from '../../src/lib/db/models/User';
import { Site } from '../../src/lib/db/models/Site';
import { Plan } from '../../src/lib/db/models/Plan';
import { Membership } from '../../src/lib/db/models/Membership';
import { hashPassword } from '../../src/lib/auth/password';
import { createSession } from '../../src/lib/auth/session';
import { sessionCookieName } from '../../src/lib/auth/cookies';
import { runWithoutTenantScope } from '../../src/lib/tenant/context';
import { hasMongo } from '../helpers/mongo';

async function person(email: string, platformRole?: 'admin') {
  const user = await User.create({
    email,
    name: email.split('@')[0],
    passwordHash: await hashPassword('correct-horse-battery'),
    emailVerifiedAt: new Date(),
    ...(platformRole ? { platformRole } : {}),
  });
  const { token } = await createSession({ userId: user._id, scope: 'platform' });
  return { user, token };
}

// Test files run one at a time; this one borrows the "pro" plan, limited to
// shop + blog, and puts back whatever was there.
const planCode = 'pro' as const;
let savedPlan: Record<string, unknown> | null = null;

async function store(slug: string, ownerId: unknown) {
  const site = await runWithoutTenantScope('test fixture: creating a Site', () =>
    Site.create({ slug, name: `Store ${slug}`, ownerId, planCode }),
  );
  await Membership.create({ userId: ownerId, siteId: site._id, role: 'owner' });
  return site;
}

async function patch(siteId: string, token: string, body: unknown) {
  vi.stubEnv('MONGODB_URI', process.env.MONGODB_TEST_URI as string);
  const { PATCH } = await import('../../src/app/api/sites/[siteId]/modules/route');
  const request = new NextRequest(`https://app.hordemart.test/api/sites/${siteId}/modules`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', cookie: `${sessionCookieName('platform')}=${token}` },
  });
  return PATCH(request, { params: Promise.resolve({ siteId }) });
}

const modulesOf = async (id: unknown) =>
  (await runWithoutTenantScope('test: reading the Site back', () => Site.findById(id).lean()))!.modules;

describe.runIf(hasMongo)('site sections (modules)', () => {
  beforeAll(async () => {
    await runWithoutTenantScope('test fixture: a plan without portfolio', async () => {
      savedPlan = await Plan.findOne({ code: planCode }).lean();
      await Plan.deleteOne({ code: planCode });
      await Plan.create({ code: planCode, name: 'Blog only', feePercentBps: 500, feeFlatKobo: 0, limits: { modules: ['store', 'blog'] } });
    });
  });
  afterAll(async () => {
    await runWithoutTenantScope('test fixture: restoring the plan', async () => {
      await Plan.deleteOne({ code: planCode });
      if (savedPlan) await Plan.collection.insertOne(savedPlan);
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('lets the owner switch the blog on and off', async () => {
    const owner = await person('modules-owner@example.com');
    const site = await store('modules-owner', owner.user._id);
    const on = await patch(String(site._id), owner.token, { blog: true });
    expect(on.status).toBe(200);
    expect((await modulesOf(site._id)).blog).toBe(true);
    expect((await patch(String(site._id), owner.token, { blog: false })).status).toBe(200);
    expect((await modulesOf(site._id)).blog).toBe(false);
  });

  it('refuses a section the plan does not include', async () => {
    const owner = await person('modules-plan@example.com');
    const site = await store('modules-plan', owner.user._id);
    const response = await patch(String(site._id), owner.token, { portfolio: true });
    expect(response.status).toBe(403);
    expect((await modulesOf(site._id)).portfolio).toBe(false);
  });

  it('refuses everyone but the owner — staff, strangers and platform admins', async () => {
    const owner = await person('modules-real-owner@example.com');
    const site = await store('modules-others', owner.user._id);
    const staff = await person('modules-staff@example.com');
    await Membership.create({ userId: staff.user._id, siteId: site._id, role: 'staff' });
    const stranger = await person('modules-stranger@example.com');
    const admin = await person('modules-admin@example.com', 'admin');
    for (const who of [staff, stranger, admin]) {
      expect((await patch(String(site._id), who.token, { blog: true })).status).toBe(403);
    }
    expect((await modulesOf(site._id)).blog).toBe(false);
  });

  it('accepts only blog and portfolio, and needs a change', async () => {
    const owner = await person('modules-shape@example.com');
    const site = await store('modules-shape', owner.user._id);
    expect((await patch(String(site._id), owner.token, { store: false })).status).toBe(422);
    expect((await patch(String(site._id), owner.token, {})).status).toBe(422);
  });
});

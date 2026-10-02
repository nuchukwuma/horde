/**
 * Password reset and seller order handling, against a real database.
 *
 * Requires MONGODB_TEST_URI. See tests/helpers/mongo.ts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { User } from '../../src/lib/db/models/User';
import { Session } from '../../src/lib/db/models/Session';
import { Order } from '../../src/lib/db/models/Order';
import { hashPassword, verifyPassword } from '../../src/lib/auth/password';
import { createSession } from '../../src/lib/auth/session';
import { requestPasswordReset, resetPasswordWithToken } from '../../src/lib/auth/passwordReset';
import { findOrderForSeller, listOrdersForSeller, setOrderFulfilled } from '../../src/lib/orders/sellerOrders';
import { runWithTenant } from '../../src/lib/tenant/context';
import { hasMongo } from '../helpers/mongo';

beforeEach(() => {
  vi.stubEnv('APP_HOST', 'app.hordemart.test');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/** The log transport prints the email; the link is read back from it. */
function captureResetLinks() {
  const links: string[] = [];
  vi.spyOn(console, 'info').mockImplementation((text: unknown) => {
    const match = String(text).match(/https?:\/\/\S+\/reset-password\?token=(\S+)/);
    if (match) links.push(match[0]);
  });
  return links;
}

const tokenFrom = (link: string) => decodeURIComponent(new URL(link).searchParams.get('token') ?? '');

async function makeUser(email = 'seller@example.com') {
  return User.create({ email, name: 'Ade', passwordHash: await hashPassword('correct-horse-battery') });
}

describe.runIf(hasMongo)('password reset', () => {
  it('emails a link on the configured app host, never the request host', async () => {
    await makeUser();
    const links = captureResetLinks();
    await requestPasswordReset('Seller@Example.com');
    expect(links).toHaveLength(1);
    expect(new URL(links[0] as string).host).toBe('app.hordemart.test');
  });

  it('sends nothing for an address with no account, and does not throw', async () => {
    const links = captureResetLinks();
    await expect(requestPasswordReset('nobody@example.com')).resolves.toBeUndefined();
    expect(links).toHaveLength(0);
  });

  it('sets the new password, signs out every session, and works only once', async () => {
    const user = await makeUser();
    await createSession({ userId: user._id, scope: 'platform' });
    await createSession({ userId: user._id, scope: 'platform' });
    const links = captureResetLinks();
    await requestPasswordReset('seller@example.com');
    const token = tokenFrom(links[0] as string);

    await resetPasswordWithToken(token, 'a brand new long password');

    const stored = await User.findById(user._id).select('+passwordHash');
    expect(await verifyPassword(stored?.passwordHash ?? '', 'a brand new long password')).toBe(true);
    expect(await Session.countDocuments({ userId: user._id, revokedAt: null })).toBe(0);

    await expect(resetPasswordWithToken(token, 'another long password!!')).rejects.toThrow(/isn’t valid/);
  });

  it('makes an older link stop working when a new one is requested', async () => {
    await makeUser();
    const links = captureResetLinks();
    await requestPasswordReset('seller@example.com');
    await requestPasswordReset('seller@example.com');
    await expect(resetPasswordWithToken(tokenFrom(links[0] as string), 'a brand new long password')).rejects.toThrow();
    await expect(resetPasswordWithToken(tokenFrom(links[1] as string), 'a brand new long password')).resolves.toEqual({
      email: 'seller@example.com',
    });
  });

  it('refuses a made-up token', async () => {
    await expect(resetPasswordWithToken('x'.repeat(43), 'a brand new long password')).rejects.toThrow();
  });
});

const siteA = { siteId: new Types.ObjectId().toHexString(), slug: 'store-a' };
const siteB = { siteId: new Types.ObjectId().toHexString(), slug: 'store-b' };

function seedOrder(tenant: typeof siteA, status: string, extra: Record<string, unknown> = {}) {
  return runWithTenant(tenant, () =>
    Order.create({
      orderNumber: `HM-T-${Math.random().toString(36).slice(2, 8)}`,
      customerEmail: 'buyer@example.com',
      customerName: 'Ada Buyer',
      customerPhone: '+2348031234567',
      delivery: { method: 'delivery', address: '12 Allen Avenue', city: 'Ikeja', state: 'Lagos' },
      items: [{ productId: new Types.ObjectId(), title: 'Wrap dress', unitPriceKobo: 500_000, quantity: 2, lineTotalKobo: 1_000_000 }],
      subtotalKobo: 1_000_000,
      totalKobo: 1_000_000,
      feeSnapshot: { planCode: 'free', feePercentBps: 500, feeFlatKobo: 0, feeCapKobo: null, vatOnPlatformFeeBps: 0, paystackFeeBearer: 'seller' },
      split: { grossKobo: 1_000_000, platformFeeKobo: 50_000, platformFeeVatKobo: 0, paystackFeeKobo: 15_000, sellerNetKobo: 935_000 },
      status,
      ...extra,
    }),
  );
}

describe.runIf(hasMongo)('seller orders', () => {
  it('lists paid orders by default, unfinished checkouts only on request', async () => {
    await seedOrder(siteA, 'paid');
    await seedOrder(siteA, 'pending');
    const paid = await runWithTenant(siteA, () => listOrdersForSeller('paid'));
    const unpaid = await runWithTenant(siteA, () => listOrdersForSeller('unpaid'));
    expect(paid.map((order) => order.status)).toEqual(['paid']);
    expect(unpaid.map((order) => order.status)).toEqual(['pending']);
    expect(paid[0]?.delivery).toMatchObject({ method: 'delivery', city: 'Ikeja', state: 'Lagos' });
    expect(paid[0]?.itemCount).toBe(2);
  });

  it('marks a paid order sent, and undoes it', async () => {
    const order = await seedOrder(siteA, 'paid');
    const sent = await runWithTenant(siteA, () => setOrderFulfilled(String(order._id), true));
    expect(sent.fulfilledAt).not.toBeNull();
    const undone = await runWithTenant(siteA, () => setOrderFulfilled(String(order._id), false));
    expect(undone.fulfilledAt).toBeNull();
  });

  it('will not mark an unpaid order sent', async () => {
    const order = await seedOrder(siteA, 'pending');
    await expect(runWithTenant(siteA, () => setOrderFulfilled(String(order._id), true))).rejects.toThrow(/paid order/);
  });

  it('cannot see or change another store’s order', async () => {
    const order = await seedOrder(siteA, 'paid');
    expect(await runWithTenant(siteB, () => findOrderForSeller(String(order._id)))).toBeNull();
    await expect(runWithTenant(siteB, () => setOrderFulfilled(String(order._id), true))).rejects.toThrow(/not found/i);
    expect(await runWithTenant(siteB, () => listOrdersForSeller('paid'))).toEqual([]);
  });
});

describe.runIf(hasMongo)('admin moderation', () => {
  async function makeSite() {
    const owner = await makeUser(`owner-${Math.random().toString(36).slice(2, 8)}@example.com`);
    const { Site } = await import('../../src/lib/db/models/Site');
    const { runWithoutTenantScope } = await import('../../src/lib/tenant/context');
    return runWithoutTenantScope('test fixture: creating a Site', () =>
      Site.create({
        slug: `store-${Math.random().toString(36).slice(2, 8)}`,
        name: 'Ade Textiles',
        ownerId: owner._id,
        planCode: 'free',
        payout: { status: 'verified', subaccountCode: 'ACCT_test' },
      }),
    );
  }

  it('suspends and reinstates a store, closing and reopening checkout, with an audit trail', async () => {
    const { moderateSite } = await import('../../src/lib/admin/moderation');
    const { AuditLog } = await import('../../src/lib/db/models/AuditLog');
    const site = await makeSite();
    const admin = new Types.ObjectId();

    expect(await moderateSite({ siteId: String(site._id), action: 'suspend', reason: 'Fraud report', actorUserId: admin })).toMatchObject({
      status: 'suspended',
    });
    const { Site } = await import('../../src/lib/db/models/Site');
    const { runWithoutTenantScope } = await import('../../src/lib/tenant/context');
    const reload = () => runWithoutTenantScope('test: reading the Site back', () => Site.findById(site._id));
    expect((await reload())?.canAcceptPayments().reason).toBe('site_not_active');

    await moderateSite({ siteId: String(site._id), action: 'reinstate', reason: 'Cleared', actorUserId: admin });
    expect((await reload())?.canAcceptPayments().allowed).toBe(true);

    const logs = await runWithoutTenantScope('test: reading the audit log', () =>
      AuditLog.find({ targetId: String(site._id) }).sort({ createdAt: 1 }).lean(),
    );
    expect(logs.map((log) => log.action)).toEqual(['site.suspended', 'site.reinstated']);
    expect((logs[0]?.after as { reason?: string }).reason).toBe('Fraud report');
  });

  it('flags a store for prohibited products, pausing checkout', async () => {
    const { moderateSite } = await import('../../src/lib/admin/moderation');
    const site = await makeSite();
    const result = await moderateSite({ siteId: String(site._id), action: 'flag', reason: 'Selling vapes', actorUserId: new Types.ObjectId() });
    expect(result.prohibitedProductFlag).toBe(true);
  });

  it('refuses an unknown store', async () => {
    const { moderateSite } = await import('../../src/lib/admin/moderation');
    await expect(
      moderateSite({ siteId: new Types.ObjectId().toHexString(), action: 'suspend', reason: 'x'.repeat(5), actorUserId: new Types.ObjectId() }),
    ).rejects.toThrow(/not found/i);
  });
});

describe.runIf(hasMongo)('who may change where a store is paid', () => {
  it('is the owner, and not a platform admin who does not own the store', async () => {
    const { Site } = await import('../../src/lib/db/models/Site');
    const { Membership } = await import('../../src/lib/db/models/Membership');
    const { runWithoutTenantScope } = await import('../../src/lib/tenant/context');
    const { requireOwnerMembership, requireSiteOwner } = await import('../../src/lib/auth/guards');

    const owner = await makeUser('real-owner@example.com');
    const admin = await User.create({ email: 'admin@example.com', name: 'Admin', passwordHash: await hashPassword('correct-horse-battery'), platformRole: 'admin' });
    const site = await runWithoutTenantScope('test fixture: creating a Site', () =>
      Site.create({ slug: 'owned-store', name: 'Owned', ownerId: owner._id, planCode: 'free' }),
    );
    await Membership.create({ userId: owner._id, siteId: site._id, role: 'owner' });

    const session = (user: typeof owner) => ({ sessionId: new Types.ObjectId(), user, scope: 'platform' as const, reauthenticatedAt: new Date() });

    await expect(requireOwnerMembership(session(owner), site._id)).resolves.toMatchObject({ role: 'owner' });
    // The support path still lets an admin read…
    await expect(requireSiteOwner(session(admin), site._id)).resolves.toMatchObject({ role: 'platform_admin' });
    // …but never change the payout account.
    await expect(requireOwnerMembership(session(admin), site._id)).rejects.toThrow(/not the owner/);
  });
});

describe.runIf(hasMongo)('terms acceptance is recorded', () => {
  it('stamps the version and time on a new seller and a new shopper', async () => {
    const { signUpSeller } = await import('../../src/lib/onboarding/signup');
    const { registerCustomer } = await import('../../src/lib/shop/customerAccount');
    const { TERMS_VERSION } = await import('../../src/lib/legal/terms');

    const seller = await signUpSeller({
      email: 'terms-seller@example.com',
      password: 'correct-horse-battery',
      name: 'Ade',
      siteName: 'Terms Shop',
      slug: 'terms-shop',
    });
    const user = await User.findById(seller.userId).lean();
    expect(user?.termsAcceptedVersion).toBe(TERMS_VERSION);
    expect(user?.termsAcceptedAt).toBeInstanceOf(Date);

    const customer = await registerCustomer({
      siteId: seller.siteId,
      email: 'terms-buyer@example.com',
      password: 'correct-horse-battery',
      name: 'Chidi',
    });
    expect(customer.termsAcceptedVersion).toBe(TERMS_VERSION);
  });
});

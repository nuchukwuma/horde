/**
 * Scheduled emails (verification reminder, setup tips), unsubscribe, and
 * shopper email confirmation, against a real database.
 *
 * Requires MONGODB_TEST_URI. See tests/helpers/mongo.ts. No RESEND_API_KEY is
 * set, so every email goes to the log transport and is read back from there.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Types } from 'mongoose';
import { User } from '../../src/lib/db/models/User';
import { Site } from '../../src/lib/db/models/Site';
import { Product } from '../../src/lib/db/models/Product';
import { Customer } from '../../src/lib/db/models/Customer';
import { hashPassword } from '../../src/lib/auth/password';
import { consumeEmailVerification, issueEmailVerification } from '../../src/lib/auth/emailVerification';
import { sendVerificationReminders } from '../../src/lib/email/reminders';
import { sendNudges } from '../../src/lib/email/nudges';
import { optOutOfNudges, setNudgesWanted, unsubscribeSignature, verifyUnsubscribe } from '../../src/lib/email/unsubscribe';
import { consumeCustomerVerification, issueCustomerVerification } from '../../src/lib/shop/customerVerification';
import { registerCustomer } from '../../src/lib/shop/customerAccount';
import { runWithTenant, runWithoutTenantScope } from '../../src/lib/tenant/context';
import { hasMongo } from '../helpers/mongo';

const DAY = 1000 * 60 * 60 * 24;
const NOW = new Date('2026-10-03T12:00:00Z');
const ENV = {
  APP_HOST: 'app.hordemart.test',
  ROOT_DOMAIN: 'hordemart.test',
  EMAIL_LINK_SECRET: 's'.repeat(48),
  REENGAGEMENT_EMAILS: 'on',
};

beforeEach(() => {
  vi.stubEnv('APP_HOST', ENV.APP_HOST);
  vi.stubEnv('ROOT_DOMAIN', ENV.ROOT_DOMAIN);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/** Every email the log transport prints, whole. */
function captureEmails() {
  const sent: string[] = [];
  vi.spyOn(console, 'info').mockImplementation((text: unknown) => {
    if (String(text).startsWith('[email:log]')) sent.push(String(text));
  });
  return sent;
}

const tokenIn = (email: string, path: string) => {
  const match = email.match(new RegExp(`https?://\\S+${path}\\?token=(\\S+)`));
  return match ? decodeURIComponent(match[1] as string) : '';
};

async function makeSeller(email: string, options: { ageDays: number; verified?: boolean; status?: string }) {
  const user = await User.create({
    email,
    name: 'Ada',
    passwordHash: await hashPassword('correct-horse-battery'),
    emailVerifiedAt: options.verified ? NOW : null,
    status: options.status ?? 'active',
  });
  // Timestamps are set by Mongoose on create; backdate through the driver.
  await User.collection.updateOne({ _id: user._id }, { $set: { createdAt: new Date(NOW.getTime() - options.ageDays * DAY) } });
  return user;
}

async function makeStore(slug: string, ownerId: Types.ObjectId, ageDays: number) {
  const site = await runWithoutTenantScope('test fixture: creating a Site', () =>
    Site.create({ slug, name: `Store ${slug}`, ownerId, planCode: 'free' }),
  );
  await Site.collection.updateOne({ _id: site._id }, { $set: { createdAt: new Date(NOW.getTime() - ageDays * DAY) } });
  return site;
}

describe.runIf(hasMongo)('verification reminder', () => {
  it('sends one reminder a day after signup, with a fresh link that replaces the first', async () => {
    const user = await makeSeller('late@example.com', { ageDays: 2 });
    const emails = captureEmails();
    await issueEmailVerification({ user, appOrigin: 'http://app.hordemart.test' });
    const firstToken = tokenIn(emails[0] as string, '/verify-email');

    const result = await sendVerificationReminders({ now: NOW });
    expect(result).toMatchObject({ sent: 1, failed: 0 });
    expect(emails[1]).toContain('Your HordeMart store is waiting');

    // Once only.
    expect((await sendVerificationReminders({ now: new Date(NOW.getTime() + DAY) })).sent).toBe(0);

    await expect(consumeEmailVerification(firstToken)).rejects.toThrow(/not valid/);
    const verified = await consumeEmailVerification(tokenIn(emails[1] as string, '/verify-email'));
    expect(verified.emailVerifiedAt).toBeTruthy();
  });

  it('leaves alone the too-new, the too-old, the verified and the suspended', async () => {
    await makeSeller('new@example.com', { ageDays: 0.5 });
    await makeSeller('old@example.com', { ageDays: 9 });
    await makeSeller('done@example.com', { ageDays: 2, verified: true });
    await makeSeller('banned@example.com', { ageDays: 2, status: 'suspended' });
    captureEmails();
    expect(await sendVerificationReminders({ now: NOW })).toMatchObject({ candidates: 0, sent: 0 });
  });

  it('gives the reminder back if the send fails, so the next run can retry', async () => {
    const user = await makeSeller('flaky@example.com', { ageDays: 2 });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementationOnce(() => {
      throw new Error('mail down');
    });
    expect(await sendVerificationReminders({ now: NOW })).toMatchObject({ sent: 0, failed: 1 });
    expect((await User.findById(user._id))?.verificationReminderSentAt).toBeNull();

    captureEmails();
    expect((await sendVerificationReminders({ now: NOW })).sent).toBe(1);
  });
});

describe.runIf(hasMongo)('setup tips', () => {
  it('sends nothing unless REENGAGEMENT_EMAILS is "on"', async () => {
    const owner = await makeSeller('off@example.com', { ageDays: 5 });
    await makeStore('off-store', owner._id, 5);
    const emails = captureEmails();
    const result = await sendNudges({ now: NOW, env: { ...ENV, REENGAGEMENT_EMAILS: undefined } });
    expect(result.enabled).toBe(false);
    expect(emails).toHaveLength(0);
  });

  it('refuses to send without a secret for the unsubscribe links', async () => {
    await expect(sendNudges({ now: NOW, env: { ...ENV, EMAIL_LINK_SECRET: '' } })).rejects.toThrow(/EMAIL_LINK_SECRET/);
  });

  it('walks a stalled store through each tip once, a few days apart', async () => {
    const owner = await makeSeller('stalled@example.com', { ageDays: 4 });
    const site = await makeStore('stalled-store', owner._id, 4);
    const emails = captureEmails();

    expect((await sendNudges({ now: NOW, env: ENV })).sent).toBe(1);
    expect(emails[0]).toContain('has no products yet');
    expect(emails[0]).toContain(`/dashboard/${String(site._id)}/products/new`);
    expect(emails[0]).toMatch(/Stop these emails: http:\/\/app\.hordemart\.test\/unsubscribe\?u=[a-f0-9]{24}&t=/);

    // Same day again: nothing. Products tip is spent; bank tip waits on the email being confirmed.
    expect((await sendNudges({ now: NOW, env: ENV })).sent).toBe(0);
    expect((await sendNudges({ now: new Date(NOW.getTime() + 4 * DAY), env: ENV })).sent).toBe(0);

    await User.updateOne({ _id: owner._id }, { $set: { emailVerifiedAt: NOW } });
    expect((await sendNudges({ now: new Date(NOW.getTime() + 4 * DAY), env: ENV })).sent).toBe(1);
    expect(emails[1]).toContain('can’t take payments yet');
    expect(emails[1]).toContain(`/dashboard/${String(site._id)}/payouts`);

    // Both spent: never again.
    expect((await sendNudges({ now: new Date(NOW.getTime() + 9 * DAY), env: ENV })).sent).toBe(0);
  });

  it('does not tell a seller with products to add products', async () => {
    const owner = await makeSeller('busy@example.com', { ageDays: 4 });
    const site = await makeStore('busy-store', owner._id, 4);
    await runWithTenant({ siteId: String(site._id) }, () =>
      Product.create({ title: 'Shirt', slug: 'shirt', priceKobo: 500_000, status: 'draft', inventory: { track: false, quantity: 0, policy: 'deny' } }),
    );
    const emails = captureEmails();
    expect((await sendNudges({ now: NOW, env: ENV })).sent).toBe(0);
    expect(emails).toHaveLength(0);
  });

  it('still suggests adding products when every product was deleted', async () => {
    const owner = await makeSeller('emptied@example.com', { ageDays: 4 });
    const site = await makeStore('emptied-store', owner._id, 4);
    await runWithTenant({ siteId: String(site._id) }, () =>
      Product.create({ title: 'Old', slug: 'old', priceKobo: 100_000, status: 'archived', inventory: { track: false, quantity: 0, policy: 'deny' } }),
    );
    const emails = captureEmails();
    expect((await sendNudges({ now: NOW, env: ENV })).sent).toBe(1);
    expect(emails[0]).toContain('has no products yet');
  });

  it('sends one tip per seller per run, however many stores they have', async () => {
    const owner = await makeSeller('many@example.com', { ageDays: 4 });
    await makeStore('many-one', owner._id, 4);
    await makeStore('many-two', owner._id, 4);
    captureEmails();
    expect((await sendNudges({ now: NOW, env: ENV })).sent).toBe(1);
  });

  it('stops for good after an unsubscribe, and the dashboard switch can turn it back on', async () => {
    const owner = await makeSeller('stop@example.com', { ageDays: 4 });
    await makeStore('stop-store', owner._id, 4);
    const id = String(owner._id);
    const signature = unsubscribeSignature(id, ENV);
    expect(verifyUnsubscribe(id, signature, ENV)).toBe(true);
    await optOutOfNudges(id);
    await optOutOfNudges(id); // idempotent

    const emails = captureEmails();
    expect((await sendNudges({ now: NOW, env: ENV })).sent).toBe(0);
    expect(emails).toHaveLength(0);

    await setNudgesWanted(id, true);
    expect((await sendNudges({ now: NOW, env: ENV })).sent).toBe(1);
  });

  it('ignores stores outside the 3–30 day window', async () => {
    const owner = await makeSeller('window@example.com', { ageDays: 40 });
    await makeStore('too-new', owner._id, 1);
    await makeStore('too-old', owner._id, 40);
    captureEmails();
    expect((await sendNudges({ now: NOW, env: ENV })).considered).toBe(0);
  });
});

describe.runIf(hasMongo)('shopper email confirmation', () => {
  async function storeWithShopper(slug: string) {
    const owner = await makeSeller(`${slug}-owner@example.com`, { ageDays: 1 });
    const site = await makeStore(slug, owner._id, 1);
    const customer = await registerCustomer({
      siteId: site._id,
      email: 'bola@example.com',
      password: 'correct-horse-battery',
      name: 'Bola',
    });
    return { site, customer };
  }

  it('sends a link on the store’s own address, from the store’s name, and confirms once', async () => {
    const { site, customer } = await storeWithShopper('ade');
    const emails = captureEmails();
    await issueCustomerVerification({ site, customer });

    expect(emails[0]).toContain('from="Store ade via HordeMart"');
    expect(emails[0]).toContain('http://ade.hordemart.test/account/verify?token=');
    const token = tokenIn(emails[0] as string, '/account/verify');

    const confirmed = await consumeCustomerVerification(site._id, token);
    expect(confirmed.emailVerifiedAt).toBeTruthy();
    await expect(consumeCustomerVerification(site._id, token)).rejects.toThrow(/not valid/);
  });

  it('will not redeem one store’s link on another store', async () => {
    const a = await storeWithShopper('store-a');
    const b = await storeWithShopper('store-b');
    const emails = captureEmails();
    await issueCustomerVerification({ site: a.site, customer: a.customer });
    const token = tokenIn(emails[0] as string, '/account/verify');

    await expect(consumeCustomerVerification(b.site._id, token)).rejects.toThrow(/not valid/);
    const bShopper = await runWithTenant({ siteId: String(b.site._id) }, () => Customer.findById(b.customer._id));
    expect(bShopper?.emailVerifiedAt).toBeNull();

    // Still good where it belongs: the failed attempt elsewhere did not spend it.
    await expect(consumeCustomerVerification(a.site._id, token)).resolves.toBeTruthy();
  });

  it('refuses a link once the address on the account has changed', async () => {
    const { site, customer } = await storeWithShopper('moved');
    const emails = captureEmails();
    await issueCustomerVerification({ site, customer });
    await runWithTenant({ siteId: String(site._id) }, () =>
      Customer.updateOne({ _id: customer._id }, { $set: { email: 'new@example.com' } }),
    );
    await expect(
      consumeCustomerVerification(site._id, tokenIn(emails[0] as string, '/account/verify')),
    ).rejects.toThrow(/not valid/);
  });

  it('makes an older link stop working when a new one is sent', async () => {
    const { site, customer } = await storeWithShopper('twice');
    const emails = captureEmails();
    await issueCustomerVerification({ site, customer });
    await issueCustomerVerification({ site, customer });
    await expect(
      consumeCustomerVerification(site._id, tokenIn(emails[0] as string, '/account/verify')),
    ).rejects.toThrow(/not valid/);
    await expect(
      consumeCustomerVerification(site._id, tokenIn(emails[1] as string, '/account/verify')),
    ).resolves.toBeTruthy();
  });
});

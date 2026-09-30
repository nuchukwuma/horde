/**
 * AC-006 (passwordHash never leaves the DB layer) plus the session lifecycle.
 *
 * Requires MONGODB_TEST_URI. See tests/helpers/mongo.ts.
 */

import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { User } from '../../src/lib/db/models/User';
import { Session } from '../../src/lib/db/models/Session';
import { LedgerEntry } from '../../src/lib/db/models/LedgerEntry';
import { hashPassword } from '../../src/lib/auth/password';
import {
  createCustomerSession,
  createSession,
  hashSessionToken,
  markReauthenticated,
  revokeAllSessionsForUser,
  revokeSession,
  validateSessionToken,
} from '../../src/lib/auth/session';
import { runWithTenant } from '../../src/lib/tenant/context';
import { hasMongo } from '../helpers/mongo';

async function makeUser(email = 'seller@example.com') {
  return User.create({
    email,
    name: 'Test Seller',
    passwordHash: await hashPassword('correct-horse-battery'),
  });
}

describe.runIf(hasMongo)('AC-006 — passwordHash is not selected by default', () => {
  it('is absent from findById', async () => {
    const user = await makeUser();
    expect((await User.findById(user._id))?.passwordHash).toBeUndefined();
  });

  it('is absent from find', async () => {
    await makeUser();
    const [found] = await User.find({});
    expect(found?.passwordHash).toBeUndefined();
  });

  it('is absent from lean queries', async () => {
    await makeUser();
    expect((await User.findOne({}).lean())?.passwordHash).toBeUndefined();
  });

  it('is absent from JSON even when explicitly loaded', async () => {
    const user = await makeUser();
    const withHash = await User.findById(user._id).select('+passwordHash');
    expect(withHash?.passwordHash).toBeTypeOf('string');

    expect(JSON.parse(JSON.stringify(withHash)).passwordHash).toBeUndefined();
  });

  it('is retrievable only with an explicit opt-in', async () => {
    const user = await makeUser();
    const withHash = await User.findById(user._id).select('+passwordHash');
    expect(withHash?.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('normalises email to lowercase so duplicates cannot be created by case', async () => {
    await makeUser('Seller@Example.COM');
    const found = await User.findOne({ email: 'seller@example.com' });
    expect(found).not.toBeNull();

    await expect(makeUser('seller@example.com')).rejects.toThrow();
  });
});

describe.runIf(hasMongo)('session lifecycle', () => {
  it('stores only a digest, never the raw token', async () => {
    const user = await makeUser();
    const { token } = await createSession({ userId: user._id, scope: 'platform' });

    const stored = await Session.findOne({ userId: user._id }).lean();
    expect(stored?.tokenHash).toBe(hashSessionToken(token));
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  it('validates a live token', async () => {
    const user = await makeUser();
    const { token } = await createSession({ userId: user._id, scope: 'platform' });

    const session = await validateSessionToken(token, 'platform');
    expect(String(session?.user._id)).toBe(String(user._id));
  });

  it('rejects a storefront token presented to the dashboard', async () => {
    // A storefront session must never authenticate a dashboard request. Since
    // the two scopes now resolve against different collections, the token
    // cannot resolve to a User even though the session row is perfectly valid.
    const { token } = await createCustomerSession({
      customerId: new Types.ObjectId(),
      siteId: new Types.ObjectId(),
    });

    expect(await validateSessionToken(token, 'platform')).toBeNull();
  });

  it('rejects a revoked token', async () => {
    const user = await makeUser();
    const { token } = await createSession({ userId: user._id, scope: 'platform' });

    await revokeSession(token);
    expect(await validateSessionToken(token, 'platform')).toBeNull();
  });

  it('rejects an expired token', async () => {
    const user = await makeUser();
    const { token } = await createSession({ userId: user._id, scope: 'platform' });

    await Session.updateOne(
      { tokenHash: hashSessionToken(token) },
      { $set: { expiresAt: new Date(Date.now() - 1_000) } },
    );
    expect(await validateSessionToken(token, 'platform')).toBeNull();
  });

  it('rejects sessions of a suspended user immediately', async () => {
    const user = await makeUser();
    const { token } = await createSession({ userId: user._id, scope: 'platform' });

    await User.updateOne({ _id: user._id }, { $set: { status: 'suspended' } });
    expect(await validateSessionToken(token, 'platform')).toBeNull();
  });

  it('revokes every session for a user at once', async () => {
    const user = await makeUser();
    const first = await createSession({ userId: user._id, scope: 'platform' });
    const second = await createSession({ userId: user._id, scope: 'platform' });

    expect(await revokeAllSessionsForUser(user._id)).toBe(2);
    expect(await validateSessionToken(first.token, 'platform')).toBeNull();
    expect(await validateSessionToken(second.token, 'platform')).toBeNull();
  });

  it('refreshes the step-up clock on re-authentication', async () => {
    const user = await makeUser();
    const { token } = await createSession({ userId: user._id, scope: 'platform' });
    const session = await validateSessionToken(token, 'platform');

    const stale = new Date(Date.now() - 60 * 60 * 1_000);
    await Session.updateOne({ _id: session!.sessionId }, { $set: { reauthenticatedAt: stale } });

    await markReauthenticated(session!.sessionId);

    const refreshed = await validateSessionToken(token, 'platform');
    expect(refreshed!.reauthenticatedAt.getTime()).toBeGreaterThan(stale.getTime());
  });

  it('rejects a garbage token', async () => {
    expect(await validateSessionToken('nonsense', 'platform')).toBeNull();
    expect(await validateSessionToken(undefined, 'platform')).toBeNull();
  });
});

describe.runIf(hasMongo)('AC-005 — ledger immutability against a real database', () => {
  const tenant = { siteId: new Types.ObjectId().toHexString(), slug: 'ledger-integration' };

  it('leaves stored values untouched after a rejected write', async () => {
    const entry = await runWithTenant(tenant, () =>
      LedgerEntry.create({
        groupId: new Types.ObjectId(),
        entryType: 'sale',
        grossKobo: 500_000,
        providerFeeKobo: 7_500,
        platformCommissionKobo: 25_000,
        sellerNetKobo: 467_500,
        status: 'pending',
      }),
    );

    await runWithTenant(tenant, () =>
      LedgerEntry.updateOne({ _id: entry._id }, { $set: { grossKobo: 1 } }),
    ).catch(() => null);

    const reloaded = await runWithTenant(tenant, () => LedgerEntry.findById(entry._id).lean());
    expect(reloaded?.grossKobo).toBe(500_000);
    expect(reloaded?.status).toBe('pending');
  });

  it('survives a delete attempt', async () => {
    await runWithTenant(tenant, () =>
      LedgerEntry.create({
        groupId: new Types.ObjectId(),
        entryType: 'sale',
        grossKobo: 100,
        sellerNetKobo: 100,
        status: 'pending',
      }),
    );

    await runWithTenant(tenant, () => LedgerEntry.deleteMany({})).catch(() => null);
    expect(await runWithTenant(tenant, () => LedgerEntry.countDocuments({}))).toBe(1);
  });

  it('nets a group to zero once reversed', async () => {
    const groupId = new Types.ObjectId();

    const sale = await runWithTenant(tenant, () =>
      LedgerEntry.create({
        groupId,
        entryType: 'sale',
        grossKobo: 500_000,
        platformCommissionKobo: 25_000,
        sellerNetKobo: 475_000,
        status: 'pending',
      }),
    );

    await runWithTenant(tenant, () =>
      LedgerEntry.create({
        groupId,
        entryType: 'reversal',
        reversesEntryId: sale._id,
        grossKobo: -500_000,
        platformCommissionKobo: -25_000,
        sellerNetKobo: -475_000,
        status: 'reversed',
        memo: 'Chargeback confirmed by the acquirer; reversing the original sale',
      }),
    );

    const entries = await runWithTenant(tenant, () => LedgerEntry.find({ groupId }).lean());
    expect(entries).toHaveLength(2);
    expect(entries.reduce((sum, e) => sum + e.grossKobo, 0)).toBe(0);
  });
});

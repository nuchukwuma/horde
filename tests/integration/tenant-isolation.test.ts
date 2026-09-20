/**
 * AC-001 / AC-002 against a real database.
 *
 * The unit suite proves the plugin throws. This proves that when it does not
 * throw, the rows actually returned belong to exactly one tenant — which is the
 * claim that matters and the one only a real query can settle.
 *
 * Requires MONGODB_TEST_URI. See tests/helpers/mongo.ts.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { Product } from '../../src/lib/db/models/Product';
import { Site } from '../../src/lib/db/models/Site';
import { getTenantId, runWithTenant, runWithoutTenantScope } from '../../src/lib/tenant/context';
import { hasMongo } from '../helpers/mongo';

const siteA = { siteId: new Types.ObjectId().toHexString(), slug: 'site-a' };
const siteB = { siteId: new Types.ObjectId().toHexString(), slug: 'site-b' };

function seed(tenant: typeof siteA, title: string) {
  return runWithTenant(tenant, () =>
    Product.create({ title, slug: title.toLowerCase(), priceKobo: 150_000 }),
  );
}

describe.runIf(hasMongo)('AC-001 — scoped reads return only the ambient tenant', () => {
  beforeEach(async () => {
    await seed(siteA, 'Alpha');
    await seed(siteB, 'Bravo');
  });

  it('find() returns only this tenant', async () => {
    const rows = await runWithTenant(siteA, () => Product.find({}).lean());
    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toBe('Alpha');
  });

  it('countDocuments() counts only this tenant', async () => {
    expect(await runWithTenant(siteA, () => Product.countDocuments({}))).toBe(1);
  });

  it('aggregate() aggregates only this tenant', async () => {
    const result = await runWithTenant(siteA, () =>
      Product.aggregate([{ $group: { _id: null, total: { $sum: '$priceKobo' } } }]),
    );
    expect(result[0]?.total).toBe(150_000);
  });

  it('cannot reach another tenant document by _id', async () => {
    const bravo = await runWithTenant(siteB, () => Product.findOne({ title: 'Bravo' }));
    const stolen = await runWithTenant(siteA, () => Product.findById(bravo!._id));
    expect(stolen).toBeNull();
  });

  it('cannot update another tenant document by _id', async () => {
    const bravo = await runWithTenant(siteB, () => Product.findOne({ title: 'Bravo' }));

    await runWithTenant(siteA, () =>
      Product.updateOne({ _id: bravo!._id }, { $set: { title: 'Hijacked' } }),
    );

    const unchanged = await runWithTenant(siteB, () => Product.findById(bravo!._id).lean());
    expect(unchanged?.title).toBe('Bravo');
  });

  it('cannot delete another tenant document by _id', async () => {
    const bravo = await runWithTenant(siteB, () => Product.findOne({ title: 'Bravo' }));
    await runWithTenant(siteA, () => Product.deleteOne({ _id: bravo!._id }));

    expect(await runWithTenant(siteB, () => Product.findById(bravo!._id))).not.toBeNull();
  });

  it('stamps siteId on insert without being asked', async () => {
    const created = await runWithTenant(siteA, () =>
      Product.create({ title: 'Charlie', slug: 'charlie', priceKobo: 500 }),
    );
    expect(String(created.siteId)).toBe(siteA.siteId);
  });

  it('scopes insertMany as well', async () => {
    await runWithTenant(siteA, () =>
      Product.insertMany([
        { title: 'Many1', slug: 'many1', priceKobo: 100 },
        { title: 'Many2', slug: 'many2', priceKobo: 200 },
      ]),
    );
    const rows = await runWithTenant(siteA, () => Product.find({}).lean());
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => String(r.siteId) === siteA.siteId)).toBe(true);
  });
});

describe.runIf(hasMongo)('AC-002 — context does not leak across concurrent work', () => {
  it('keeps two interleaved tenants separate', async () => {
    await seed(siteA, 'Alpha');
    await seed(siteB, 'Bravo');

    // Each task yields mid-flight so the two genuinely overlap rather than
    // running one after the other.
    const readA = runWithTenant(siteA, async () => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      const rows = await Product.find({}).lean();
      return { tenant: getTenantId(), titles: rows.map((r) => r.title) };
    });

    const readB = runWithTenant(siteB, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      const rows = await Product.find({}).lean();
      return { tenant: getTenantId(), titles: rows.map((r) => r.title) };
    });

    const [a, b] = await Promise.all([readA, readB]);

    expect(a.tenant).toBe(siteA.siteId);
    expect(a.titles).toEqual(['Alpha']);
    expect(b.tenant).toBe(siteB.siteId);
    expect(b.titles).toEqual(['Bravo']);
  });

  it('holds isolation across many concurrent tenants', async () => {
    const tenants = Array.from({ length: 25 }, (_, index) => ({
      siteId: new Types.ObjectId().toHexString(),
      slug: `tenant-${index}`,
    }));

    await Promise.all(
      tenants.map((tenant, index) =>
        runWithTenant(tenant, () =>
          Product.create({ title: `P${index}`, slug: `p${index}`, priceKobo: 1_000 + index }),
        ),
      ),
    );

    const results = await Promise.all(
      tenants.map((tenant, index) =>
        runWithTenant(tenant, async () => {
          await new Promise((resolve) => setTimeout(resolve, Math.random() * 25));
          const rows = await Product.find({}).lean();
          return rows.length === 1 && rows[0]?.title === `P${index}`;
        }),
      ),
    );

    expect(results.every(Boolean)).toBe(true);
  });
});

describe.runIf(hasMongo)('the escape hatch reaches across tenants when asked', () => {
  it('returns every tenant row when deliberately bypassed', async () => {
    await seed(siteA, 'Alpha');
    await seed(siteB, 'Bravo');

    const all = await runWithoutTenantScope('platform admin cross-tenant revenue report', () =>
      Product.find({}).lean(),
    );
    expect(all).toHaveLength(2);
  });
});

describe.runIf(hasMongo)('unique indexes hold', () => {
  it('enforces one site per slug', async () => {
    const ownerId = new Types.ObjectId();
    await Site.create({ slug: 'taken', name: 'First', ownerId, planCode: 'free' });
    await expect(
      Site.create({ slug: 'taken', name: 'Second', ownerId, planCode: 'free' }),
    ).rejects.toThrow();
  });

  it('allows the same product slug on different sites', async () => {
    await runWithTenant(siteA, () =>
      Product.create({ title: 'Shirt', slug: 'shirt', priceKobo: 100 }),
    );
    await expect(
      runWithTenant(siteB, () => Product.create({ title: 'Shirt', slug: 'shirt', priceKobo: 100 })),
    ).resolves.toBeDefined();
  });

  it('rejects a duplicate product slug within one site', async () => {
    await runWithTenant(siteA, () =>
      Product.create({ title: 'Shirt', slug: 'shirt', priceKobo: 100 }),
    );
    await expect(
      runWithTenant(siteA, () => Product.create({ title: 'Other', slug: 'shirt', priceKobo: 100 })),
    ).rejects.toThrow();
  });
});

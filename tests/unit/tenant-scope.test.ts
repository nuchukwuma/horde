/**
 * AC-001: a tenant-owned query with no tenant in scope throws rather than
 * returning rows.
 *
 * Runs without a database on purpose. Mongoose fires query middleware before it
 * contacts a server, so the fail-closed guarantee is observable here — and a
 * test that never connects cannot accidentally pass because a collection
 * happened to be empty.
 */

import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { Product } from '../../src/lib/db/models/Product';
import { Order } from '../../src/lib/db/models/Order';
import { LedgerEntry } from '../../src/lib/db/models/LedgerEntry';
import { TenantScopeError } from '../../src/lib/errors';
import {
  getTenantId,
  isScopeBypassed,
  requireTenantId,
  runWithTenant,
  runWithTenantSync,
  runWithoutTenantScope,
  runWithoutTenantScopeSync,
} from '../../src/lib/tenant/context';

const tenantA = { siteId: new Types.ObjectId().toHexString(), slug: 'site-a' };
const tenantB = { siteId: new Types.ObjectId().toHexString(), slug: 'site-b' };

describe('AC-001 — reads fail closed without a tenant', () => {
  it('rejects find()', async () => {
    await expect(Product.find({})).rejects.toThrow(TenantScopeError);
  });

  it('rejects findOne()', async () => {
    await expect(Product.findOne({ title: 'x' })).rejects.toThrow(TenantScopeError);
  });

  it('rejects findById()', async () => {
    await expect(Product.findById(new Types.ObjectId())).rejects.toThrow(TenantScopeError);
  });

  it('rejects countDocuments()', async () => {
    await expect(Product.countDocuments({})).rejects.toThrow(TenantScopeError);
  });

  it('rejects distinct()', async () => {
    await expect(Product.distinct('title')).rejects.toThrow(TenantScopeError);
  });

  it('rejects aggregate()', async () => {
    await expect(Product.aggregate([{ $match: {} }])).rejects.toThrow(TenantScopeError);
  });

  it('rejects the same operations on Order and LedgerEntry', async () => {
    await expect(Order.find({})).rejects.toThrow(TenantScopeError);
    await expect(LedgerEntry.find({})).rejects.toThrow(TenantScopeError);
  });
});

describe('AC-001 — writes fail closed without a tenant', () => {
  it('rejects save()', async () => {
    const orphan = new Product({ title: 'Orphan', slug: 'orphan', priceKobo: 1_000 });
    await expect(orphan.save()).rejects.toThrow(TenantScopeError);
  });

  it('rejects updateOne()', async () => {
    await expect(Product.updateOne({}, { $set: { title: 'x' } })).rejects.toThrow(
      TenantScopeError,
    );
  });

  it('rejects updateMany()', async () => {
    await expect(Product.updateMany({}, { $set: { title: 'x' } })).rejects.toThrow(
      TenantScopeError,
    );
  });

  it('rejects deleteOne() and deleteMany()', async () => {
    await expect(Product.deleteOne({})).rejects.toThrow(TenantScopeError);
    await expect(Product.deleteMany({})).rejects.toThrow(TenantScopeError);
  });

  it('rejects findOneAndUpdate()', async () => {
    await expect(Product.findOneAndUpdate({}, { $set: { title: 'x' } })).rejects.toThrow(
      TenantScopeError,
    );
  });
});

describe('AC-001 — a mismatched explicit siteId is rejected, never merged', () => {
  it('refuses a filter naming a different tenant', async () => {
    await expect(
      runWithTenant(tenantA, () =>
        Product.find({ siteId: new Types.ObjectId(tenantB.siteId) }),
      ),
    ).rejects.toThrow(/while tenant .* is in scope/);
  });

  it('refuses a save carrying a different tenant', async () => {
    await expect(
      runWithTenant(tenantA, () => {
        const doc = new Product({
          title: 'Smuggled',
          slug: 'smuggled',
          priceKobo: 100,
          siteId: new Types.ObjectId(tenantB.siteId),
        });
        return doc.save();
      }),
    ).rejects.toThrow(TenantScopeError);
  });

  it('refuses an update that tries to reparent a document', async () => {
    await expect(
      runWithTenant(tenantA, () =>
        Product.updateOne({}, { $set: { siteId: new Types.ObjectId(tenantB.siteId) } }),
      ),
    ).rejects.toThrow(/cannot be moved between tenants|cannot move between tenants/);
  });

  it('refuses a top-level (non-$set) siteId in an update', async () => {
    await expect(
      runWithTenant(tenantA, () =>
        Product.updateOne({}, { siteId: new Types.ObjectId(tenantB.siteId) }),
      ),
    ).rejects.toThrow(TenantScopeError);
  });
});

describe('AC-001 — estimatedDocumentCount is blocked outright', () => {
  it('cannot be scoped, so it is refused even with a tenant present', async () => {
    await expect(
      runWithTenant(tenantA, () => Product.estimatedDocumentCount()),
    ).rejects.toThrow(/cannot be tenant-scoped/);
  });
});

describe('tenant context mechanics', () => {
  it('exposes the ambient tenant inside runWithTenant', () => {
    runWithTenantSync(tenantA, () => {
      expect(getTenantId()).toBe(tenantA.siteId);
      expect(requireTenantId()).toBe(tenantA.siteId);
      expect(isScopeBypassed()).toBe(false);
    });
  });

  it('has no ambient tenant outside', () => {
    expect(getTenantId()).toBeUndefined();
    expect(() => requireTenantId()).toThrow(TenantScopeError);
  });

  it('restores the outer tenant after a nested scope exits', () => {
    runWithTenantSync(tenantA, () => {
      runWithTenantSync(tenantB, () => {
        expect(getTenantId()).toBe(tenantB.siteId);
      });
      expect(getTenantId()).toBe(tenantA.siteId);
    });
  });

  it('rejects a malformed siteId', async () => {
    await expect(runWithTenant({ siteId: 'not-an-objectid', slug: 'x' }, () => null)).rejects.toThrow(
      TenantScopeError,
    );
  });

  it('keeps the scope open until a lazy query has actually executed', async () => {
    // Mongoose queries only run on await. If runWithTenant returned the Query
    // without awaiting, execution would land outside the scope and throw.
    await expect(
      runWithTenant(tenantA, () => Product.find({ siteId: new Types.ObjectId(tenantB.siteId) })),
    ).rejects.toThrow(/while tenant .* is in scope/);
  });

  it('survives an await inside the scope', async () => {
    await runWithTenant(tenantA, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(getTenantId()).toBe(tenantA.siteId);
    });
  });
});

describe('the escape hatch is deliberate and self-documenting', () => {
  it('requires a descriptive reason', () => {
    expect(() => runWithoutTenantScopeSync('nope', () => null)).toThrow(TenantScopeError);
    expect(() => runWithoutTenantScopeSync('', () => null)).toThrow(TenantScopeError);
  });

  it('accepts a real reason', async () => {
    const result = await runWithoutTenantScope(
      'platform admin cross-tenant revenue report',
      () => 42,
    );
    expect(result).toBe(42);
  });

  it('reports itself as bypassed', () => {
    runWithoutTenantScopeSync('platform admin cross-tenant revenue report', () => {
      expect(isScopeBypassed()).toBe(true);
    });
  });

  it('makes requireTenantId throw rather than guess', () => {
    runWithoutTenantScopeSync('platform admin cross-tenant revenue report', () => {
      expect(() => requireTenantId()).toThrow(/scope is bypassed/);
    });
  });

  it('does not persist past its callback', async () => {
    await runWithoutTenantScope('platform admin cross-tenant revenue report', () => null);
    expect(isScopeBypassed()).toBe(false);
    await expect(Product.find({})).rejects.toThrow(TenantScopeError);
  });

  it('still refuses a bypassed save that names no site', async () => {
    await expect(
      runWithoutTenantScope('intentional cross-tenant write attempt', () =>
        new Product({ title: 'Nowhere', slug: 'nowhere', priceKobo: 100 }).save(),
      ),
    ).rejects.toThrow(/requires an explicit siteId/);
  });
});

describe('siteId is stamped automatically', () => {
  it('fills siteId from the ambient tenant during validation', async () => {
    await runWithTenant(tenantA, async () => {
      const doc = new Product({ title: 'Auto', slug: 'auto', priceKobo: 100 });
      await doc.validate();
      expect(String(doc.siteId)).toBe(tenantA.siteId);
    });
  });

  it('validates cleanly once stamped, with no required-siteId complaint', async () => {
    await runWithTenant(tenantA, async () => {
      const doc = new Product({ title: 'Auto2', slug: 'auto2', priceKobo: 100 });
      await expect(doc.validate()).resolves.toBeUndefined();
    });
  });
});

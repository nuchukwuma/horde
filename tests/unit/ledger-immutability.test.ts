/**
 * AC-005: the ledger is append-only.
 *
 * If a ledger row can be edited it stops being evidence of what happened, and
 * evidence of what happened is the entire reason the collection exists.
 */

import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { LedgerEntry } from '../../src/lib/db/models/LedgerEntry';
import { AuditLog } from '../../src/lib/db/models/AuditLog';
import { ImmutableRecordError } from '../../src/lib/errors';
import { runWithTenant } from '../../src/lib/tenant/context';

const tenant = { siteId: new Types.ObjectId().toHexString(), slug: 'ledger-test' };

function saleEntry(overrides: Record<string, unknown> = {}) {
  return new LedgerEntry({
    groupId: new Types.ObjectId(),
    entryType: 'sale',
    grossKobo: 500_000,
    providerFeeKobo: 7_500,
    platformCommissionKobo: 25_000,
    platformCommissionVatKobo: 0,
    sellerNetKobo: 467_500,
    status: 'pending',
    ...overrides,
  });
}

describe('AC-005 — entries cannot be mutated', () => {
  it('rejects updateOne', async () => {
    await expect(
      runWithTenant(tenant, () =>
        LedgerEntry.updateOne({ _id: new Types.ObjectId() }, { $set: { status: 'settled' } }),
      ),
    ).rejects.toThrow(ImmutableRecordError);
  });

  it('rejects updateMany', async () => {
    await expect(
      runWithTenant(tenant, () => LedgerEntry.updateMany({}, { $set: { status: 'settled' } })),
    ).rejects.toThrow(ImmutableRecordError);
  });

  it('rejects findOneAndUpdate', async () => {
    await expect(
      runWithTenant(tenant, () => LedgerEntry.findOneAndUpdate({}, { $set: { grossKobo: 1 } })),
    ).rejects.toThrow(ImmutableRecordError);
  });

  it('rejects replaceOne', async () => {
    await expect(
      runWithTenant(tenant, () => LedgerEntry.replaceOne({}, { grossKobo: 1 })),
    ).rejects.toThrow(ImmutableRecordError);
  });

  it('rejects re-saving an existing document', async () => {
    // Simulates a document loaded from the database: siteId already set (the
    // stamping hook only fills new documents) and no longer new.
    const entry = saleEntry({ siteId: new Types.ObjectId(tenant.siteId) });
    entry.isNew = false;
    await expect(entry.save()).rejects.toThrow(ImmutableRecordError);
  });

  it('names the collection and suggests the correct remedy', async () => {
    await expect(
      runWithTenant(tenant, () => LedgerEntry.updateMany({}, { $set: { status: 'settled' } })),
    ).rejects.toThrow(/LedgerEntry is append-only.*reversing entry/s);
  });
});

describe('AC-005 — entries cannot be deleted', () => {
  it('rejects deleteOne', async () => {
    await expect(
      runWithTenant(tenant, () => LedgerEntry.deleteOne({ _id: new Types.ObjectId() })),
    ).rejects.toThrow(ImmutableRecordError);
  });

  it('rejects deleteMany', async () => {
    await expect(runWithTenant(tenant, () => LedgerEntry.deleteMany({}))).rejects.toThrow(
      ImmutableRecordError,
    );
  });

  it('rejects findOneAndDelete', async () => {
    await expect(runWithTenant(tenant, () => LedgerEntry.findOneAndDelete({}))).rejects.toThrow(
      ImmutableRecordError,
    );
  });
});

describe('corrections are expressed as reversals', () => {
  it('validates a reversing entry that references the original', async () => {
    const original = saleEntry();
    const reversal = saleEntry({
      groupId: original.groupId,
      entryType: 'reversal',
      reversesEntryId: original._id,
      grossKobo: -500_000,
      providerFeeKobo: -7_500,
      platformCommissionKobo: -25_000,
      sellerNetKobo: -467_500,
      status: 'reversed',
      memo: 'Customer disputed the charge; reversing the original sale',
    });

    await expect(runWithTenant(tenant, () => reversal.validate())).resolves.toBeUndefined();
    expect(reversal.grossKobo).toBe(-500_000);
  });

  it('requires a memo on a reversal', async () => {
    const reversal = saleEntry({
      entryType: 'reversal',
      reversesEntryId: new Types.ObjectId(),
      grossKobo: -500_000,
      status: 'reversed',
    });
    await expect(runWithTenant(tenant, () => reversal.validate())).rejects.toThrow(
      /require a memo/,
    );
  });

  it('requires a memo on an adjustment', async () => {
    const adjustment = saleEntry({ entryType: 'adjustment', status: 'settled' });
    await expect(runWithTenant(tenant, () => adjustment.validate())).rejects.toThrow(
      /require a memo/,
    );
  });

  it('requires a reversal to name the entry it reverses', async () => {
    const reversal = saleEntry({
      entryType: 'reversal',
      grossKobo: -1_000,
      status: 'reversed',
      memo: 'Reversing an entry but forgetting to say which one',
    });
    await expect(runWithTenant(tenant, () => reversal.validate())).rejects.toThrow(
      /must reference the entry it reverses/,
    );
  });

  it('allows negative amounts, which is how reversals net to zero', async () => {
    const reversal = saleEntry({
      entryType: 'reversal',
      reversesEntryId: new Types.ObjectId(),
      grossKobo: -500_000,
      providerFeeKobo: -7_500,
      platformCommissionKobo: -25_000,
      sellerNetKobo: -467_500,
      status: 'reversed',
      memo: 'Reversal after a confirmed chargeback from the acquirer',
    });
    await expect(runWithTenant(tenant, () => reversal.validate())).resolves.toBeUndefined();

    const original = saleEntry();
    expect(original.grossKobo + reversal.grossKobo).toBe(0);
  });

  it('still rejects fractional amounts on a reversal', async () => {
    const reversal = saleEntry({
      entryType: 'reversal',
      reversesEntryId: new Types.ObjectId(),
      grossKobo: -500_000.5,
      status: 'reversed',
      memo: 'A reversal carrying a fractional amount must not be accepted',
    });
    await expect(runWithTenant(tenant, () => reversal.validate())).rejects.toThrow(
      /whole number of kobo/,
    );
  });
});

describe('AC-005 — audit logs are append-only as well', () => {
  it('rejects editing an audit record', async () => {
    await expect(
      AuditLog.updateOne({ _id: new Types.ObjectId() }, { $set: { action: 'user.login' } }),
    ).rejects.toThrow(ImmutableRecordError);
  });

  it('rejects deleting audit records', async () => {
    await expect(AuditLog.deleteMany({})).rejects.toThrow(ImmutableRecordError);
  });
});

# ADR-0006: Append-only ledger corrected by reversing entries

**Date**: 2026-09-20
**Status**: accepted
**Deciders**: repository owner, Claude

## Context

The ledger is what the platform can point at when a seller disputes a fee, when
figures must be reconciled against Paystack, or when a regulator asks how a
number was produced. A record that can be edited after the fact proves only what
someone most recently wanted it to say.

## Decision

`LedgerEntry` and `AuditLog` are append-only, enforced by a Mongoose plugin that
rejects every update and delete operation and refuses to re-save a loaded
document. Corrections are made by writing a reversing entry that references the
original and carries a mandatory memo.

Status is fixed at write time. A sale that later settles does not have its row
updated — a new `settlement` entry sharing the original's `groupId` records it.
The state of an order is the sum of its entries.

## Alternatives Considered

### Alternative 1: Mutable rows with an updated_at timestamp
- **Pros**: simplest; one row per transaction; trivial current-state queries
- **Cons**: history is destroyed on every edit; no way to distinguish a
  correction from a cover-up
- **Why not**: defeats the purpose of keeping a ledger at all

### Alternative 2: Mutable rows plus a separate audit table
- **Pros**: current state stays easy to read; history preserved alongside
- **Cons**: two sources of truth that can disagree, and the audit table is
  usually written by the same code path that got it wrong
- **Why not**: reconciliation would have to decide which table to believe

### Alternative 3: Full double-entry with explicit debit and credit accounts
- **Pros**: the actual accounting standard; balances provable by construction
- **Cons**: significantly more machinery than the brief's columns require
- **Why not**: deferred, not rejected. The `groupId` grouping leaves room to
  migrate if the platform ever needs real account balances.

## Consequences

### Positive
- History cannot be rewritten, by accident or otherwise
- A refund shows the original sale, the reversal, and the reason, all retained
- Reconciliation against Paystack compares immutable facts

### Negative
- "Current status of this order" is a sum over entries, not a column read.
  Mitigated by indexing on `(siteId, createdAt)` and `groupId`, and by keeping
  the order's own status denormalised on `Order`.
- More rows: a sale that settles and is later refunded produces at least three
- Signed amounts mean every aggregate must be written to expect negatives

### Risks
- `Model.bulkWrite` and raw driver access bypass Mongoose middleware entirely.
  Mongoose exposes no schema-level hook for them, so this rests on code review;
  it is called out in the plugin source and in CLAUDE.md.

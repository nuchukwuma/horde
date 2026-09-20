# ADR-0008: Never store bank account numbers

**Date**: 2026-09-20
**Status**: accepted
**Deciders**: repository owner, Claude
**Legal review**: relevant to NDPA 2023 obligations — worth confirming retention posture

## Context

Payout onboarding needs a seller's bank account number to create a Paystack
subaccount. The original Phase 1 schema carried `payout.accountNumberEnc`, an
encrypted copy, on the assumption that we would need the number again later.

Working through the actual flow, we never do. The number is used once, to
create the subaccount. Afterwards every payout routes through the returned
`subaccount_code`. Changing bank details later means creating a new subaccount,
for which the seller re-enters the number anyway.

Under the NDPA 2023 a Nigerian bank account number is regulated personal
financial data. Holding it creates breach-notification exposure, retention
obligations, and a target — in exchange, here, for nothing.

## Decision

The full account number is never persisted. It exists in memory for the length
of one request and is then discarded. The database keeps only:

- the last four digits, for display and for fraud investigation
- the account name as returned by Paystack's resolve endpoint
- the bank code
- the Paystack subaccount code

`payout.accountNumberEnc` is removed from the schema, and with it the
AES-256-GCM helper written to protect it.

## Alternatives Considered

### Alternative 1: Store it encrypted at rest (the original design)
- **Pros**: available for a future re-verification or provider migration
- **Cons**: key management, rotation, and breach scope, for a value we have no
  identified use for; encryption reduces risk but does not remove it
- **Why not**: the strongest protection for data is not to hold it

### Alternative 2: Store it encrypted, then delete after subaccount creation
- **Pros**: survives a crash between resolve and subaccount creation
- **Cons**: all of the above, for a window measured in seconds; the recovery it
  buys is a seller re-submitting a form
- **Why not**: complexity and exposure disproportionate to a re-typed field

## Consequences

### Positive
- A database compromise yields no account numbers
- No encryption key to manage, rotate, or leak
- Smaller NDPA footprint and a simpler answer to a retention question

### Negative
- Changing bank details requires re-entering the full number; it cannot be
  pre-filled
- Migrating to a different payment provider would require every seller to
  re-enter their details rather than a backend re-registration

### Risks
- The `accountNumberLast4` field is close enough in name to the sensitive one
  that the audit redactor initially redacted it too, destroying the very field
  investigators need. `lib/audit.ts` now carries an explicit safe-key allowlist,
  with a test pinning the behaviour.

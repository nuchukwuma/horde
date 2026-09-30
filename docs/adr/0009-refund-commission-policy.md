# ADR-0009: Refund commission policy is named configuration, not implied behaviour

**Date**: 2026-09-21
**Status**: accepted
**Deciders**: repository owner, Claude
**Commercial review**: the default affects seller economics — confirm before launch

## Context

When an order is refunded, the money going back to the customer has to come from
somewhere. Three parties took a share of the original sale: the seller, the
platform, and Paystack.

Paystack's position is fixed — its processing fee is not returned on a refund.
So on every refund, somebody is permanently out that fee.

What is genuinely a decision is our commission. Silence on this question does not
avoid it: whatever the code does on the first refund becomes the policy, and
neither sellers nor we would have chosen it deliberately.

## Decision

Three named policies, selected by `REFUND_COMMISSION_POLICY`:

| Policy | Platform returns | Seller bears |
|---|---|---|
| `retain` | nothing | the whole refund |
| `return_proportional` (default) | commission in proportion to the amount refunded | the rest |
| `return_full` | its entire commission, even on a partial refund | the rest |

The rule lives in one pure function, `computeRefundSplit`, with the reasoning in
the module comment. Nothing else decides who pays.

Default is `return_proportional`: on a full refund the seller should not be left
paying commission on a sale that, from the customer's side, did not happen.

## Alternatives Considered

### Alternative 1: Always retain the commission
- **Pros**: simplest; defensible as payment for a service we performed
- **Cons**: on a full refund the seller pays us for a sale that no longer exists,
  which reads as punitive and invites disputes
- **Why not**: rejected as a default, kept as an option

### Alternative 2: Always return in full
- **Pros**: most seller-friendly; easy to explain
- **Cons**: on a partial refund we can return more commission than the refund is
  worth, and we absorb processing costs on every disputed order
- **Why not**: rejected as a default, kept as an option with a cap

### Alternative 3: Per-plan policy
- **Pros**: a Pro plan could offer better refund terms
- **Cons**: another dimension on every order's fee snapshot before anyone has
  asked for it
- **Why not**: deferred. The snapshot already carries fee terms, so adding it
  later is mechanical.

## Consequences

### Positive
- Who absorbs a refund is a stated rule, not an accident of implementation
- One pure function, unit-tested across policies, amounts and VAT settings
- An unrecognised configuration value throws rather than defaulting, so a typo
  cannot silently change who pays

### Negative
- Changing the policy does not restate past refunds; the ledger keeps whatever
  rule was in force, which is correct but means two refunds can differ
- `return_full` needs a cap so a small refund cannot cost us more than the
  refund itself, which is arithmetic nobody would guess from the policy name

### Risks
- **The mechanics of who Paystack actually debits on a split-transaction refund
  are unverified.** Our ledger records the intended division. If Paystack debits
  the platform's balance for the full amount and does not claw back the seller's
  share, we hold a receivable against the seller — which is a different
  relationship from the one ADR-0007 is built on, and a question for Paystack
  before any real refund is issued.
- VAT on returned commission is returned proportionally. Whether that matches
  what a tax authority expects is a question for an accountant.

# ADR-0007: Never hold seller funds

**Date**: 2026-09-20
**Status**: accepted
**Deciders**: repository owner, Claude
**Legal review**: REQUIRED — confirm with a Nigerian fintech lawyer before launch

## Context

The platform collects payment on a seller's storefront, takes a commission, and
the seller receives the rest. There are two ways to implement that sentence, and
they are not equivalent in Nigerian law.

Money that rests in an account the platform controls, even briefly, makes the
platform a custodian of third-party funds. That is the activity CBN licensing
categories exist to regulate. Money that never touches the platform's account
does not raise the question in the same form.

The brief also asked for an optional payout hold for new sellers. Implemented
naively — collect the money, sit on it for N days, then release — that is
precisely the custodial model, introduced as a risk control.

## Decision

Paystack splits at the point of payment. The seller's share settles from Paystack
to the seller's subaccount; the platform's commission settles to the platform.
The platform never receives the seller's money and therefore never releases it.

The new-seller hold gates **transacting**, not settlement: until
`Site.checkoutEnabledFrom` has passed, the site cannot accept payments at all.
No sale happens, so there is nothing to hold.

## Alternatives Considered

### Alternative 1: Collect to a platform account, pay out on a schedule
- **Pros**: total control over timing; simpler refund and chargeback handling;
  enables a seller wallet later
- **Cons**: platform holds third-party funds; likely engages CBN licensing;
  platform insolvency would put seller money at risk
- **Why not**: converts a software company into a financial institution

### Alternative 2: Split settlement, but hold the seller's share for new sellers
- **Pros**: keeps the risk control without redesigning it
- **Cons**: to hold the share, the platform must first receive it — which is
  Alternative 1 wearing a disguise
- **Why not**: same regulatory exposure, arrived at by accident

## Consequences

### Positive
- Seller funds are never at risk from platform insolvency
- Keeps the platform on the defensible side of the licensing question
- Refunds flow through Paystack's own refund API, not a manual transfer

### Negative
- Cannot offer a seller wallet, stored balance, or instant payout product
  without revisiting this decision *and* the licensing question first
- Less control over refund timing; bounded by Paystack's settlement cycle
- Commission on a refunded order must be recovered by reversing entry rather
  than by simply not paying it out

### Risks
- **The words matter as much as the mechanism.** Calling any feature a "wallet",
  "balance", "escrow", or "deposit" describes a regulated activity regardless of
  implementation. If a feature needs one of those words, get legal advice before
  building it.
- Whether this structure is sufficient is a lawyer's call, not an engineer's.
  This ADR records the reasoning, not a legal opinion.

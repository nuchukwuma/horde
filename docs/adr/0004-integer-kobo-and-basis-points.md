# ADR-0004: Integer kobo and basis points for all money

**Date**: 2026-09-20
**Status**: accepted
**Deciders**: repository owner, Claude

## Context

Floating-point money loses fractions, and a platform that takes a percentage of
every sale compounds those losses across every transaction. The brief already
required integer kobo. The part that needed deciding was how to represent the
*rate*: a 5% fee written as `0.05` reintroduces the exact error that integer
amounts exist to prevent.

## Decision

Amounts are integer kobo. Rates are integer basis points (1 bps = 0.01%, so 5% =
500). All fee arithmetic runs through `applyBps`, which multiplies in BigInt and
rounds with an explicit, named mode.

Money fields are declared with `koboField()`, which attaches an integer validator
so the database rejects a fractional amount even if application code lets one
through.

## Alternatives Considered

### Alternative 1: Decimal128
- **Pros**: native Mongo type, exact decimal arithmetic
- **Cons**: arithmetic in JavaScript still goes through conversion; comparisons
  and aggregation get fiddly; invites treating money as a decimal again
- **Why not**: integers are simpler and the unit is already indivisible

### Alternative 2: A money library (dinero.js and similar)
- **Pros**: well-tested, handles allocation
- **Cons**: a dependency in the most security-sensitive path, for arithmetic we
  can express in fifty lines and pin with tests
- **Why not**: the surface we need is small and the tests are the real asset

## Consequences

### Positive
- `fee + net === gross` holds exactly, verified across a sweep of amounts and
  rates rather than asserted
- BigInt intermediates stay exact at magnitudes where `amount * bps` would
  exceed `Number.MAX_SAFE_INTEGER`
- Rounding is explicit at one call site instead of implicit at many

### Negative
- Naira must be parsed from strings at the boundary; a JSON number has already
  lost precision by the time it arrives
- `MAX_KOBO` caps a single amount at roughly ₦1 trillion — deliberate, since a
  larger value almost always means naira were passed where kobo were expected

### Risks
- Rounding direction on the fee is a business decision as much as a technical
  one. It is centralised in `applyBps` so it can be changed in one place, and
  the reconciliation sweep will catch a change that breaks the invariant.

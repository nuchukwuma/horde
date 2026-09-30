# ADR-0003: Fail-closed tenant scoping via AsyncLocalStorage

**Date**: 2026-09-20
**Status**: accepted
**Deciders**: repository owner, Claude

## Context

Every seller's data shares collections with every other seller's. A single query
that forgets `{ siteId }` returns another seller's products, orders, or revenue.
The brief asked for tenant scoping that makes a missed filter "hard to write".
Hard to write is not the same as impossible, and for a payments platform the
difference is a business-ending incident.

## Decision

An `AsyncLocalStorage` carries the ambient siteId for the duration of a request.
A Mongoose plugin injects it into every query and stamps it onto every insert. A
tenant-owned query with no ambient tenant throws `TenantScopeError` rather than
executing unfiltered.

## Alternatives Considered

### Alternative 1: Repository layer that takes siteId as an argument
- **Pros**: explicit; no hidden context; trivial to reason about
- **Cons**: every call site can still pass the wrong id or a new method can omit it
- **Why not**: moves the mistake rather than removing it

### Alternative 2: Database-per-tenant
- **Pros**: strongest possible isolation
- **Cons**: connection-pool exhaustion on serverless, painful migrations, costly
  at the scale of many small sellers
- **Why not**: operationally disproportionate for a platform of small stores

### Alternative 3: Convention plus code review
- **Pros**: no machinery
- **Cons**: relies on nobody ever being in a hurry
- **Why not**: the failure mode is silent cross-tenant disclosure

## Consequences

### Positive
- Application code never writes `siteId` by hand, so it cannot forget to
- A query that escapes its scope raises a 500 instead of leaking data
- Cross-tenant access requires `runWithoutTenantScope('<reason>')`, which is
  greppable and self-documenting

### Negative
- `runWithTenant` must be async and must await its callback, because Mongoose
  queries are lazy thenables. A sync variant exists for non-database work, and
  the distinction is a real trap for newcomers.
- `estimatedDocumentCount()` cannot be scoped at all and is blocked outright
- `Model.bulkWrite` and raw driver access bypass the plugin; nothing in the ORM
  layer can close that, so it rests on review

### Risks
- Context loss across unusual async boundaries would cause spurious 500s. This
  is the safe direction to fail, and is covered by a concurrency test.

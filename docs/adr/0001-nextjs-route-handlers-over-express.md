# ADR-0001: Next.js route handlers over a separate Express API

**Date**: 2026-09-20
**Status**: accepted
**Deciders**: repository owner, Claude

## Context

The stack allowed either Next.js route handlers or a separate Node/Express API
on Render. The deciding constraints: wildcard tenant subdomains on Vercel, a
Paystack webhook that needs the raw request body for HMAC verification, and a
small team that has to operate whatever is built.

## Decision

All API surface is Next.js App Router route handlers in the same project as the
frontend. A separate service is added later only for work that genuinely does
not fit serverless.

## Alternatives Considered

### Alternative 1: Separate Express API on Render
- **Pros**: deploy isolation between storefront traffic and payment logic; no
  serverless timeout; conventional raw-body handling
- **Cons**: two deploys, CORS, duplicated models and session plumbing
- **Why not**: the isolation is real but buys little when both halves share one
  database and one session model; the operational cost lands immediately

### Alternative 2: tRPC or GraphQL
- **Pros**: typed client/server contract
- **Cons**: another abstraction over the part of the system that most needs to be
  read plainly under incident conditions
- **Why not**: Paystack speaks REST and webhooks; matching that is simpler

## Consequences

### Positive
- One repository, one deploy target, one auth implementation
- Tenant middleware and API share the same host-resolution logic

### Negative
- Route handlers must opt into the Node runtime wherever Mongoose is used;
  Edge middleware cannot touch the database (see ADR-0003)
- Webhook handlers must read the raw body explicitly rather than relying on a
  body-parser configuration
- Long-running work — reconciliation, scheduled payout-hold expiry — does not
  fit serverless and will need a separate worker in Phase 5

### Risks
- A slow storefront page and a payment webhook share a concurrency budget.
  Revisit if storefront traffic ever threatens webhook latency.

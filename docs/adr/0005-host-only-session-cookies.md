# ADR-0005: Host-only session cookies, never a wildcard domain

**Date**: 2026-09-20
**Status**: accepted
**Deciders**: repository owner, Claude

## Context

Every seller gets a subdomain of the platform's registrable domain, and sellers
control the content served there — product descriptions, blog posts, portfolio
markup. That makes each tenant subdomain an origin an untrusted party can
influence.

The convenient way to share a login across `hordemart.com`,
`app.hordemart.com`, and every storefront is a cookie scoped to
`.hordemart.com`. That cookie is sent to **every** subdomain, including every
seller's. Any seller could then collect the dashboard session of any logged-in
visitor to their store.

## Decision

Session cookies never set a `Domain` attribute, making them host-only. Dashboard
sessions live on `APP_HOST` under the `__Host-` prefix, which makes the browser
itself enforce host-only, `Secure`, and `Path=/`. Storefront customer sessions
are separate, named differently, and scoped to their own tenant host.

Sessions are also scope-tagged server-side: a storefront token presented to a
dashboard route is rejected even though the row is valid.

## Alternatives Considered

### Alternative 1: Wildcard `.hordemart.com` cookie
- **Pros**: single sign-on across all subdomains for free
- **Cons**: hands every seller a copy of every visitor's session
- **Why not**: this is the worst available failure in a multi-tenant design

### Alternative 2: Wildcard cookie plus strict HTML sanitisation
- **Pros**: keeps the convenience; sanitisation is needed anyway
- **Cons**: one sanitiser bypass, one misconfigured CSP, or one future feature
  that renders raw HTML converts a content bug into total session compromise
- **Why not**: a single control with catastrophic failure is not a boundary

### Alternative 3: Stateless JWTs
- **Pros**: no session table lookup
- **Cons**: cannot be revoked before expiry
- **Why not**: suspending a compromised seller account has to take effect now,
  and changing bank details requires step-up re-auth that a stateless token
  cannot express

## Consequences

### Positive
- A stored-XSS bug on a seller storefront cannot reach dashboard sessions
- Suspending an account kills every live session on the next request
- `reauthenticatedAt` supports step-up confirmation for payout changes,
  independent of session age

### Negative
- No automatic single sign-on between storefronts and the dashboard; a customer
  logging into two storefronts logs in twice, which is correct — they are
  different merchants
- Every session validation costs a database read
- `__Host-` requires `Secure`, so local development relaxes it outside
  production

### Risks
- A future "custom domains" feature adds origins per tenant. The host-only rule
  extends to them unchanged, but the mapping must be verified server-side and
  never trusted from a header.

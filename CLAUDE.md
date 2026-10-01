# HordeMart

Multi-tenant website platform for Nigeria. Sellers get a Site (store, portfolio,
or blog) on `<slug>.hordemart.com`. Customers pay on the seller's storefront;
Paystack splits each payment between the seller's subaccount and the platform
fee and settles both directly. The platform never holds seller funds.

## Non-negotiable rules

These are architectural invariants, not style preferences. A change that breaks
one of them is wrong even if the tests pass.

1. **Every tenant-owned document carries `siteId`, and no query is written
   without it.** Do not hand-write `{ siteId }` filters. Wrap work in
   `runWithTenant()` and let `tenantScopePlugin` inject the filter. Queries that
   escape a tenant scope throw `TenantScopeError` rather than returning rows.
2. **All money is an integer count of kobo.** Never a float, never naira. All
   rates are integer basis points (500 = 5%). Define money fields with
   `koboField()` so the validator is attached automatically.
3. **Never trust the client for amounts, fees, or seller identity.** Checkout
   re-reads prices from the database and computes the split server-side. A
   request body containing a price is ignored, not validated.
4. **The ledger is append-only.** No updates, no deletes. Correct a mistake with
   a reversing entry. A state change (pending → settled) is a *new* entry
   sharing the original's `groupId`.
5. **Secrets come from environment variables and are never logged.** Not in
   error messages, not in audit records, not in webhook payload storage.
6. **We never hold seller funds.** Paystack settles to the seller's subaccount
   directly. Do not build a wallet, a platform balance, or a "release funds"
   flow — that converts a software company into a regulated one. New-seller
   holds block *transacting*, never settlement.
7. **Paystack test keys only** until the repository owner says otherwise in
   writing.

## Architecture

### Tenant resolution is two-layer

`src/middleware.ts` runs on the **Edge runtime**, where Mongoose cannot load. It
parses the Host header, rejects reserved subdomains, and sets `x-hm-site-slug`.
It deletes any client-supplied copy of that header first — otherwise a request
could name any tenant it liked.

Node-runtime code then calls `withSiteBySlug(slug, fn)`, which loads the Site and
establishes the ambient tenant.

### Tenant scoping uses AsyncLocalStorage

`runWithTenant()` puts the siteId in an `AsyncLocalStorage`. The Mongoose plugin
reads it and injects `siteId` into every query, stamping it onto every insert.

`runWithTenant` is **async and awaits its callback**, which is load-bearing: a
Mongoose query is a lazy thenable, so returning `Model.find()` unawaited would
execute it after the scope had exited. Use `runWithTenantSync` only for work
that touches no database.

Cross-tenant work uses `runWithoutTenantScope('<reason 10+ chars>', fn)`. Audit
every call site with `grep -rn runWithoutTenantScope src/`.

### Cookie scoping is a security boundary

Seller subdomains serve seller-controlled content, so they are effectively
untrusted origins. **Session cookies never set a `Domain` attribute.** A cookie
on `.hordemart.com` would hand every seller a copy of any logged-in visitor's
dashboard session. Platform sessions use the `__Host-` prefix, which makes the
browser enforce this.

## Layout

```
src/
├── middleware.ts           Edge: host → slug. No database.
├── app/                    Next.js App Router (JSX)
├── components/             React components (JSX)
└── lib/                    TypeScript — all money, auth, and data logic
    ├── db/
    │   ├── connect.ts      Serverless-safe cached connection
    │   ├── plugins/        tenantScope (fail-closed), appendOnly
    │   └── models/
    ├── tenant/             context, host resolution, reserved names, loadSite
    ├── auth/               password, session, cookies, guards
    ├── money/kobo.ts       Integer money + basis-point arithmetic
    ├── security/           HTML sanitisation
    ├── validation/         zod schemas
    └── errors.ts
tests/
├── unit/                   No database needed
└── integration/            Requires MONGODB_TEST_URI
```

**Language split:** TypeScript for everything under `lib/` (money, auth, data).
Plain JSX for UI components and pages. `allowJs` is on, `checkJs` is off.

## Commands

```bash
npm run dev         # Next.js dev server (Turbopack)
npm run dev:webpack # Same, on webpack — fallback if Turbopack misbehaves
npm test            # Unit suite; integration suites skip without a database
npm run typecheck   # tsc --noEmit
npm run verify      # typecheck + lint + test — run before every commit
```

Integration tests need a real MongoDB:

```bash
docker run -d -p 27017:27017 mongo:7
MONGODB_TEST_URI=mongodb://127.0.0.1:27017/hordemart_test npm test
```

CI must set `MONGODB_TEST_URI`. A green run that silently skipped every database
test is worse than a red one.

## Conventions

- Validate every request body with a zod schema from `lib/validation/`.
- Errors extend `AppError` and carry a `publicMessage` safe to return to a
  client. Internal detail stays in `message` and never reaches a response.
- Guards throw instead of returning booleans — a forgotten `if` around a boolean
  grants access silently.
- Sanitise seller HTML on write (`sanitizeRichText`), not on render.
- Conventional commits: `feat:`, `fix:`, `chore:`, `test:`, `docs:`.

## Regulatory context

This is a Nigerian payments product. Decisions with legal weight are flagged in
`docs/adr/` and must be confirmed with a Nigerian fintech lawyer, not inferred
from code. Live areas: CBN licensing posture, NDPA 2023 (bank details are
regulated personal data), VAT on the platform fee, and Paystack's own
marketplace approval requirement.

`vatOnPlatformFeeBps` defaults to **0** deliberately. Charging VAT you are not
registered to remit is worse than not charging it. Set it only on a tax
adviser's instruction.

## Skills

Project skills live in `.claude/skills/` (292 of them, general-purpose). The ones
that apply here: `backend-patterns`, `api-design`, `security-review`,
`coding-standards`, `react-patterns`, `react-testing`, `e2e-testing`,
`redis-patterns`, `tdd-workflow`, `verification-loop`.

Skipped as wrong-stack or misleading by name: `prisma-patterns`,
`postgres-patterns` (we use MongoDB); `finance-billing-ops`,
`customer-billing-ops` (Stripe *operations*, not payment-system construction);
`dashboard-builder` (Grafana monitoring, not seller dashboards).

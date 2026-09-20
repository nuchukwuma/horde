# ADR-0002: TypeScript for money and auth, JavaScript for UI

**Date**: 2026-09-20
**Status**: accepted
**Deciders**: repository owner, Claude

## Context

The repository owner's stated stack is "all JavaScript and React". Most of the
guidance this project follows, and every payment-handling example worth copying,
is written in TypeScript. Fee arithmetic and ledger entries are where a
kobo-versus-naira or string-versus-number confusion costs real money.

## Decision

TypeScript for everything under `src/lib/` — money, auth, database models,
validation. Plain JavaScript and JSX for React components and pages. `allowJs`
is on and `checkJs` is off, so the two coexist without annotating UI code.

## Alternatives Considered

### Alternative 1: TypeScript everywhere
- **Pros**: one language, no boundary, strongest guarantees
- **Cons**: departs from the owner's stated preference for the UI work they will
  spend the most time in
- **Why not**: the owner chose the split deliberately

### Alternative 2: Plain JavaScript everywhere with JSDoc
- **Pros**: matches the stated stack literally
- **Cons**: the fee engine and ledger lose compile-time checking exactly where a
  type error is most expensive
- **Why not**: too much risk concentrated in the money path

## Consequences

### Positive
- Money and auth code gets compile-time checking without imposing types on UI work
- `npm run typecheck` covers the payment path meaningfully

### Negative
- Two conventions in one repository; contributors must know which side of the
  line a file sits on
- Types stop at the boundary: a JSX component consuming a typed lib function
  gets no checking of what it does with the result
- `isolatedModules` (required by Next.js) blocks ambient const enums, which is
  why `@node-rs/argon2`'s `Algorithm` is spelled as a literal in
  `lib/auth/password.ts`

### Risks
- The boundary drifts if business logic creeps into components. Rule of thumb:
  anything that touches money, auth, or the database belongs in `lib/`.

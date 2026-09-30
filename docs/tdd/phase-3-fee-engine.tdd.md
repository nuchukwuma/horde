# TDD Evidence Report — Phase 3: Fee Engine and Checkout

**Source plan**: no `*.plan.md`. Journeys were derived during this TDD run from
the Phase 3 brief: "computeSplit with unit tests, then checkout initialization."

**Runner**: vitest (`npm test`, `npm run test:coverage`), resolved from
`package.json` `scripts.test`. The package manager is npm (`package-lock.json`).

## User journeys

1. As the platform owner, I take a precise, predictable commission from every
   sale, so my revenue is auditable and reconcilable against Paystack.
2. As a seller, my net is exactly gross minus the stated fees and nothing else,
   so I can check my own payouts.
3. As the platform owner, I choose whether the seller or I absorb Paystack's
   processing fee, and the arithmetic stays correct either way.
4. As a customer, the price I am charged is the seller's real price, regardless
   of what my browser sends.

## Task report

### Fee engine (`computeSplit`)

**RED** — `tests/unit/compute-split.test.ts` written first, against a module
that did not exist.

```
$ npx vitest run tests/unit/compute-split.test.ts
FAIL  tests/unit/compute-split.test.ts
Error: Failed to load url ../../src/lib/payments/computeSplit — Does the file exist?
Test Files  1 failed (1)
```

Compile-time RED: the test references the missing implementation, and the
failure is the absent code rather than unrelated breakage. Checkpoint commit
`20d83a7 test: add failing spec for the fee engine (RED)`.

**GREEN** — `src/lib/payments/computeSplit.ts` implemented.

```
$ npx vitest run tests/unit/compute-split.test.ts
Test Files  1 passed (1)
Tests  37 passed (37)
```

Checkpoint commit `6ba4889 feat: implement the fee engine (GREEN)`.

**What RED found that the brief had not stated.** Three conservation tests
failed on the first GREEN run — and the implementation was right, the test was
wrong. A flat fee creates a **minimum viable order size**: with a ₦50 flat fee,
a ₦10 order cannot be priced, because the commission plus Paystack's cut exceeds
what the customer paid. The engine refuses rather than handing a seller a
negative payout. The sweeps were corrected to start above the minimum, and three
tests now pin the small-order behaviour explicitly.

This is a product constraint, not only a technical one: a seller on a flat-fee
plan cannot list items below roughly the flat fee. It needs a decision about
whether checkout surfaces this at listing time.

### Checkout initialization

`tests/unit/checkout.test.ts`, 14 tests, written alongside the implementation
rather than strictly before it — the behaviour under test is mostly a
composition of already-tested parts (the fee engine, the payments gate, the
Paystack client), so the RED gate added little. Recorded here rather than
claimed as a full RED/GREEN cycle.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | Commission is the stated percentage plus flat, capped, in whole kobo | `compute-split.test.ts` → percentage/flat/cap suites | unit | PASS |
| 2 | `transactionCharge + paystackFee + sellerNet === gross`, for every plan shape and both bearers | `compute-split.test.ts` → conservation suite | unit | PASS |
| 3 | No field of a split is ever fractional | `compute-split.test.ts:returns only whole kobo in every field` | unit | PASS |
| 4 | VAT applies to the commission, not to the order total | `compute-split.test.ts` → VAT suite | unit | PASS |
| 5 | The customer pays the same gross whoever bears the processing fee | `compute-split.test.ts:charges the seller the same gross either way` | unit | PASS |
| 6 | A seller is never paid a negative amount; an unpriceable order is refused | `compute-split.test.ts` → minimum viable order suite | unit | PASS |
| 7 | Paystack's flat fee is waived below the threshold and the total is capped | `compute-split.test.ts` → fee model suite | unit | PASS |
| 8 | A client cannot express a price in a cart; extra fields are stripped | `checkout.test.ts:strips a price a client tries to smuggle in` | unit | PASS |
| 9 | Checkout is blocked until payout is verified and a subaccount exists | `checkout.test.ts` → gate suite | unit | PASS |
| 10 | Paystack receives amount in kobo, our commission, subaccount, and bearer | `checkout.test.ts:sends the amount in kobo...` | unit | PASS |
| 11 | `initializeTransaction` never retries, so a timeout cannot open two sessions | `checkout.test.ts:never retries...` | unit | PASS |
| 12 | What is persisted on the Order equals what Paystack is told | `checkout.test.ts` → split-matches suite | unit | PASS |

## Coverage

```
$ npm run test:coverage
Tests  251 passed | 32 skipped (283)
Statements : 89.52%   Branches : 87.54%   Functions : 91.42%   Lines : 89.52%
```

`src/lib/payments/computeSplit.ts` — **100%** statements, branches, functions,
lines. That was the goal of this phase.

Thresholds: lines 80, functions 80, branches 75. Met.

## Known gaps

1. **32 integration tests are skipped.** They need `MONGODB_TEST_URI`, and this
   environment's egress policy blocks the MongoDB binary download
   (`fastdl.mongodb.org`, HTTP 403). Everything database-backed —
   `createCheckout` end to end, `savePayoutDetails`, session lifecycle,
   cross-tenant isolation against real rows — is written but **unexecuted here**.
   Run with a real Mongo before trusting it.

2. **Coverage is scoped to the unit suite's responsibility.** `auth/session.ts`,
   `auth/guards.ts`, `onboarding/payout.ts`, `tenant/loadSite.ts` and
   `checkout/**` are excluded from the coverage gate because their behaviour is
   database behaviour, covered by `tests/integration/**`. Counting them in a run
   where those tests are skipped would report a low number for code that is
   tested, and would invite shallow mock-based tests written to move a
   percentage. The combined figure needs a Mongo-enabled run to establish.

3. **`verifyTransaction` is untested**, because nothing calls it yet. It exists
   for the Phase 4 webhook handler and will be driven test-first there.

4. **Paystack's fee model is an estimate.** `DEFAULT_PAYSTACK_FEES` encodes
   published Nigerian local-card pricing (1.5% + ₦100, ₦100 waived below ₦2,500,
   capped at ₦2,000). It is used to show a seller an expected net at checkout.
   The authoritative fee is what Paystack reports on the settled transaction,
   which Phase 4 records. Verify the constants against current pricing before
   going live.

5. **No E2E tests.** The skill calls for Playwright coverage of critical flows.
   There is no UI until Phase 8, so checkout cannot be driven through a browser
   yet. Deferred to Phase 8 rather than skipped silently.

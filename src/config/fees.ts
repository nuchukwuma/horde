/**
 * ⚠️  PLACEHOLDER RATES — NOT CONFIRMED FOR PRODUCTION  ⚠️
 *
 * The single place every fee number in HordeMart comes from:
 *   - the landing page's payout calculator and example split
 *   - the default plans written by scripts/seed.ts
 *   - computeSplit's estimate of the payment processor's fee
 *
 * Keeping them in one file is the point: the calculator a seller sees and
 * the plan checkout actually charges cannot drift apart.
 *
 * Before launch, each value must be replaced with a confirmed one:
 *   - PAYMENT_FEE — from your signed Paystack pricing / merchant agreement.
 *     Paystack's public page is a starting point, not a contract.
 *   - PLANS[*].feePercentBps etc. — a commercial decision for HordeMart.
 *   - vatOnPlatformFeeBps — set only on a tax adviser's instruction (see
 *     CLAUDE.md: charging VAT you are not registered to remit is worse than
 *     not charging it).
 *
 * All amounts are integer kobo; all rates are integer basis points
 * (100 bps = 1%). Changing a plan here does not change a plan already in the
 * database — re-run the seed or update the Plan document.
 */

export const FEES_ARE_PLACEHOLDERS = true;

/** Card/transfer processing fee model, as charged by the payment processor. */
export const PAYMENT_FEE = {
  /** PLACEHOLDER. Percentage of the sale. */
  percentBps: 150,
  /** PLACEHOLDER. Flat amount added per transaction. */
  flatKobo: 10_000,
  /** PLACEHOLDER. Below this sale amount, the flat amount is waived. */
  flatWaiverBelowKobo: 250_000,
  /** PLACEHOLDER. The fee never exceeds this. */
  capKobo: 200_000,
} as const;

export interface PlanFeeTerms {
  code: 'free' | 'pro';
  name: string;
  feePercentBps: number;
  feeFlatKobo: number;
  feeCapKobo: number | null;
  vatOnPlatformFeeBps: number;
  paystackFeeBearer: 'seller' | 'platform';
}

export const PLANS: Record<PlanFeeTerms['code'], PlanFeeTerms> = {
  free: {
    code: 'free',
    name: 'Free',
    feePercentBps: 700, // PLACEHOLDER
    feeFlatKobo: 0, // PLACEHOLDER
    feeCapKobo: null, // PLACEHOLDER
    vatOnPlatformFeeBps: 0, // Deliberately 0 — tax adviser decision.
    paystackFeeBearer: 'seller',
  },
  pro: {
    code: 'pro',
    name: 'Pro',
    feePercentBps: 300, // PLACEHOLDER
    feeFlatKobo: 5_000, // PLACEHOLDER
    feeCapKobo: 200_000, // PLACEHOLDER
    vatOnPlatformFeeBps: 0, // Deliberately 0 — tax adviser decision.
    paystackFeeBearer: 'seller',
  },
};

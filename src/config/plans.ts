/**
 * ⚠️  PLACEHOLDER TIERS AND PRICES — NOT CONFIRMED FOR PRODUCTION  ⚠️
 *
 * What separates Free from Premium: how much a store can upload. Every limit
 * a seller can hit is here, so the pricing page, the billing page and the
 * code that enforces the limits all read the same numbers.
 *
 * Commission rates per tier live in ./fees.ts (also placeholders). The
 * Premium price must match the amount on the Paystack plan named by
 * PAYSTACK_PREMIUM_PLAN_CODE — Paystack charges the plan's amount, and the
 * webhook refuses a payment below PREMIUM.priceKobo.
 *
 * Before charging anyone, confirm with a Nigerian tax adviser whether VAT
 * (currently 7.5%) applies to the subscription and how it is shown, and with
 * a lawyer how auto-renewal must be disclosed (FCCPA) and how recurring card
 * debits must be mandated. See the PR description.
 */

export type TierCode = 'free' | 'pro';

export interface TierLimits {
  /** Products that are not archived. Archiving frees a slot. */
  products: number;
  /** Photos on one product. */
  imagesPerProduct: number;
  /** Journal posts that are not archived. */
  posts: number;
  /** Portfolio projects that are not archived. */
  projects: number;
  /** Largest single photo a seller may upload, before we shrink it. */
  maxUploadBytes: number;
}

export interface Tier {
  code: TierCode;
  label: string;
  /** Per month, in kobo. 0 for free. */
  priceKobo: number;
  limits: TierLimits;
  /** One line for the pricing table. */
  pitch: string;
}

const MB = 1024 * 1024;

export const TIERS: Record<TierCode, Tier> = {
  free: {
    code: 'free',
    label: 'Free',
    priceKobo: 0,
    pitch: 'Everything you need to start selling.',
    limits: {
      products: 20, // PLACEHOLDER
      imagesPerProduct: 3, // PLACEHOLDER
      posts: 10, // PLACEHOLDER
      projects: 6, // PLACEHOLDER
      maxUploadBytes: 2 * MB, // PLACEHOLDER
    },
  },
  pro: {
    code: 'pro',
    label: 'Premium',
    priceKobo: 500_000, // PLACEHOLDER: ₦5,000 a month
    pitch: 'For stores with a big catalogue and a lot to show.',
    limits: {
      products: 1_000, // PLACEHOLDER
      imagesPerProduct: 8, // PLACEHOLDER
      posts: 1_000, // PLACEHOLDER
      projects: 300, // PLACEHOLDER
      maxUploadBytes: 5 * MB, // PLACEHOLDER
    },
  },
};

export const TIERS_ARE_PLACEHOLDERS = true;

/** An unknown plan code gets Free's limits: the safe direction. */
export function tierFor(planCode: string | null | undefined): Tier {
  return planCode === 'pro' ? TIERS.pro : TIERS.free;
}

/**
 * Add-ons handled by a person, not by software: a seller who wants one
 * emails the address configured in SALES_CONTACT_EMAIL.
 */
export const ADDONS = [
  {
    id: 'domain',
    title: 'Your own domain',
    body: 'Use an address like www.yourshop.com.ng instead of yourshop.hordemart.com. We set up the domain and the security certificate with you.',
    subject: 'Custom domain',
  },
  {
    id: 'email',
    title: 'Business email',
    body: 'An email address on your own domain, like orders@yourshop.com.ng, so customers see your brand in their inbox.',
    subject: 'Business email',
  },
] as const;

/**
 * Where add-on requests go. Read from SALES_CONTACT_EMAIL and shape-checked;
 * null when unset, in which case the page says contact details are coming
 * rather than inventing an address.
 */
export function salesContactEmail(env: Record<string, string | undefined> = process.env): string | null {
  const value = env.SALES_CONTACT_EMAIL?.trim();
  return value && /^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/i.test(value) ? value : null;
}

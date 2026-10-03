/**
 * A tenant. Every tenant-owned document points back here via siteId.
 *
 * Site itself is not tenant-scoped — it is the thing that defines the scope.
 */

import mongoose, { Schema, type HydratedDocument, type Model, type Types } from 'mongoose';
import type { Timestamps } from './timestamps';
import { SLUG_MAX_LENGTH, SLUG_MIN_LENGTH, validateSlug } from '../../tenant/reserved';

export type SiteStatus = 'active' | 'suspended' | 'closed';
export type PayoutStatus = 'unset' | 'pending' | 'verified' | 'rejected';

export interface SitePayout {
  businessName?: string;
  bankCode?: string;
  /**
   * Last four digits only. Safe to display, safe to log.
   *
   * The full account number is deliberately never stored. It is needed once, to
   * create the Paystack subaccount, and after that the subaccount code is what
   * payouts route through. Under the NDPA it is regulated financial data, and
   * data we do not hold cannot leak.
   */
  accountNumberLast4?: string;
  /** Account name as returned by Paystack's resolve endpoint, never user-typed. */
  resolvedAccountName?: string;
  /** Paystack subaccount code, e.g. ACCT_xxxxxxxx. */
  subaccountCode?: string;
  status: PayoutStatus;
  verifiedAt?: Date | null;
  lastChangedAt?: Date | null;
  lastChangedBy?: Types.ObjectId | null;
}

export type SubscriptionStatus = 'none' | 'pending' | 'active' | 'non_renewing' | 'cancelled' | 'attention';

/**
 * The store's Premium subscription with HordeMart — the platform's own
 * revenue, paid by the seller. Nothing here touches a seller's sales money.
 */
export interface SiteSubscription {
  status: SubscriptionStatus;
  /** Our reference for the checkout that started it (hmsub_…). */
  pendingReference?: string | null;
  paystackCustomerCode?: string | null;
  paystackSubscriptionCode?: string | null;
  paystackPlanCode?: string | null;
  currentPeriodEnd?: Date | null;
  startedAt?: Date | null;
  cancelledAt?: Date | null;
}

export interface SiteModules {
  store: boolean;
  portfolio: boolean;
  blog: boolean;
}

export interface SiteAttributes extends Timestamps {
  _id: Types.ObjectId;
  slug: string;
  customDomain?: string | null;
  ownerId: Types.ObjectId;
  name: string;
  modules: SiteModules;
  planCode: string;
  status: SiteStatus;
  currency: 'NGN';
  payout: SitePayout;
  /**
   * New-seller hold. Until this timestamp passes, the site cannot *accept*
   * payments at all.
   *
   * Deliberately gates transacting rather than settlement. Holding money on a
   * seller's behalf and releasing it later would make us a custodian of third-party
   * funds, which is a licensing question we do not want to answer. Blocking the
   * sale outright achieves the same risk reduction with none of that exposure.
   */
  checkoutEnabledFrom?: Date | null;
  /** Set by an admin when a site is suspected of selling restricted goods. */
  prohibitedProductFlag: boolean;
  theme: Record<string, unknown>;
  settings: Record<string, unknown>;
  /**
   * Seller social handles. Handles, never URLs — lib/content/socials.ts
   * explains why, and builds the links for rendering.
   */
  socials: Record<string, string>;
  /** Which setup tips have gone to the owner (lib/email/nudges.ts). Each is sent once. */
  nudgesSent?: { noProducts?: Date | null; noPayout?: Date | null };
  subscription: SiteSubscription;
  /** Separate apps the seller has connected. See lib/integrations/. */
  integrations?: {
    mrmouse?: {
      /** When the owner agreed to share store details with MrMouse; null = not connected. */
      connectedAt?: Date | null;
      connectedBy?: Types.ObjectId | null;
      /** The MrMouse connection terms version the owner accepted. */
      termsVersion?: string | null;
      /** MrMouse is the source of stock levels, and hears about sales. */
      stockSync?: boolean;
    };
  };
}

const siteSchema = new Schema<SiteAttributes>(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: SLUG_MIN_LENGTH,
      maxlength: SLUG_MAX_LENGTH,
      validate: {
        validator: (value: string) => validateSlug(value).valid,
        message: (props: { value: string }) => `"${props.value}" is not an available subdomain`,
      },
    },
    // No default: a store without a custom domain has NO value here, not
    // null. The uniqueness index below only covers real domains. It used to
    // be `unique + sparse` with `default: null`, and a sparse index skips
    // missing fields but NOT nulls — so the first store took the one null
    // slot and every later signup failed with a duplicate-key error.
    customDomain: {
      type: String,
      lowercase: true,
      trim: true,
    },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    modules: {
      store: { type: Boolean, default: true },
      portfolio: { type: Boolean, default: false },
      blog: { type: Boolean, default: false },
    },
    planCode: { type: String, required: true, default: 'free', index: true },
    status: {
      type: String,
      required: true,
      enum: ['active', 'suspended', 'closed'],
      default: 'active',
      index: true,
    },
    currency: { type: String, required: true, enum: ['NGN'], default: 'NGN' },
    payout: {
      businessName: { type: String, trim: true, maxlength: 200 },
      bankCode: { type: String, trim: true, maxlength: 10 },
      accountNumberLast4: { type: String, trim: true, maxlength: 4 },
      resolvedAccountName: { type: String, trim: true, maxlength: 200 },
      subaccountCode: { type: String, trim: true, index: true, sparse: true },
      status: {
        type: String,
        required: true,
        enum: ['unset', 'pending', 'verified', 'rejected'],
        default: 'unset',
      },
      verifiedAt: { type: Date, default: null },
      lastChangedAt: { type: Date, default: null },
      lastChangedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    },
    checkoutEnabledFrom: { type: Date, default: null },
    prohibitedProductFlag: { type: Boolean, default: false, index: true },
    theme: { type: Schema.Types.Mixed, default: {} },
    settings: { type: Schema.Types.Mixed, default: {} },
    socials: { type: Schema.Types.Mixed, default: {} },
    integrations: {
      mrmouse: {
        connectedAt: { type: Date, default: null },
        connectedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        termsVersion: { type: String, default: null },
        stockSync: { type: Boolean, default: false },
      },
    },
    nudgesSent: {
      noProducts: { type: Date, default: null },
      noPayout: { type: Date, default: null },
    },
    subscription: {
      status: {
        type: String,
        enum: ['none', 'pending', 'active', 'non_renewing', 'cancelled', 'attention'],
        default: 'none',
      },
      pendingReference: { type: String, default: null, index: true, sparse: true },
      paystackCustomerCode: { type: String, default: null },
      paystackSubscriptionCode: { type: String, default: null, index: true, sparse: true },
      paystackPlanCode: { type: String, default: null },
      currentPeriodEnd: { type: Date, default: null },
      startedAt: { type: Date, default: null },
      cancelledAt: { type: Date, default: null },
    },
  },
  { timestamps: true },
);

siteSchema.index(
  { customDomain: 1 },
  {
    unique: true,
    name: 'customDomain_unique_when_set',
    partialFilterExpression: { customDomain: { $type: 'string' } },
  },
);

/**
 * Every condition that must hold before this site may take money.
 * Checkout calls this; it is the single gate, so there is one place to audit.
 */
siteSchema.methods.canAcceptPayments = function canAcceptPayments(now = new Date()): {
  allowed: boolean;
  reason?: string;
} {
  const site = this as SiteAttributes;

  if (site.status !== 'active') return { allowed: false, reason: 'site_not_active' };
  if (site.prohibitedProductFlag) return { allowed: false, reason: 'prohibited_products_flagged' };
  if (site.payout.status !== 'verified') return { allowed: false, reason: 'payout_not_verified' };
  if (!site.payout.subaccountCode) return { allowed: false, reason: 'no_subaccount' };
  if (site.checkoutEnabledFrom && site.checkoutEnabledFrom > now) {
    return { allowed: false, reason: 'new_seller_hold' };
  }

  return { allowed: true };
};

export interface SiteMethods {
  canAcceptPayments(now?: Date): { allowed: boolean; reason?: string };
}

/** A loaded Site, carrying its instance methods. */
export type SiteDocument = HydratedDocument<SiteAttributes, SiteMethods>;

export const Site: Model<SiteAttributes, Record<string, never>, SiteMethods> =
  (mongoose.models.Site as Model<SiteAttributes, Record<string, never>, SiteMethods>) ??
  mongoose.model<SiteAttributes, Model<SiteAttributes, Record<string, never>, SiteMethods>>(
    'Site',
    siteSchema,
  );

/**
 * A tenant. Every tenant-owned document points back here via siteId.
 *
 * Site itself is not tenant-scoped — it is the thing that defines the scope.
 */

import mongoose, { Schema, type Model, type Types } from 'mongoose';
import { SLUG_MAX_LENGTH, SLUG_MIN_LENGTH, validateSlug } from '../../tenant/reserved';

export type SiteStatus = 'active' | 'suspended' | 'closed';
export type PayoutStatus = 'unset' | 'pending' | 'verified' | 'rejected';

export interface SitePayout {
  businessName?: string;
  bankCode?: string;
  /** Last four digits only. Safe to display, safe to log. */
  accountNumberLast4?: string;
  /**
   * Full account number, encrypted at rest with PAYOUT_ENCRYPTION_KEY.
   *
   * Only needed to create the Paystack subaccount. Once subaccountCode exists,
   * this should be cleared — the number is regulated personal financial data
   * under the NDPA and keeping it past its purpose is pure liability.
   */
  accountNumberEnc?: string | null;
  /** Account name as returned by Paystack's resolve endpoint, never user-typed. */
  resolvedAccountName?: string;
  /** Paystack subaccount code, e.g. ACCT_xxxxxxxx. */
  subaccountCode?: string;
  status: PayoutStatus;
  verifiedAt?: Date | null;
  lastChangedAt?: Date | null;
  lastChangedBy?: Types.ObjectId | null;
}

export interface SiteModules {
  store: boolean;
  portfolio: boolean;
  blog: boolean;
}

export interface SiteAttributes {
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
    customDomain: {
      type: String,
      default: null,
      lowercase: true,
      trim: true,
      unique: true,
      sparse: true,
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
      accountNumberEnc: { type: String, default: null, select: false },
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
  },
  { timestamps: true },
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

export const Site: Model<SiteAttributes, Record<string, never>, SiteMethods> =
  (mongoose.models.Site as Model<SiteAttributes, Record<string, never>, SiteMethods>) ??
  mongoose.model<SiteAttributes, Model<SiteAttributes, Record<string, never>, SiteMethods>>(
    'Site',
    siteSchema,
  );

/**
 * A shopper's account on ONE storefront. Tenant-scoped.
 *
 * Deliberately not a User (see models/User.ts). Three reasons, in order of
 * weight:
 *
 *   1. Cookie scope. A platform-wide buyer identity needs a session cookie the
 *      browser will send to every seller subdomain, which means a Domain
 *      attribute on `.hordemart.com`. auth/cookies.ts exists to forbid exactly
 *      that: sellers control the content on their own subdomain, so such a
 *      cookie hands every seller every logged-in shopper's session.
 *
 *   2. Tenancy. A buyer's order history belongs to the store they bought from.
 *      One seller must not learn that a shopper also buys from a competitor,
 *      which a shared account would leak through any "your orders" view.
 *
 *   3. Data protection. Under the NDPA a shopper's details are held by the
 *      seller as much as by us. Keeping the record inside the tenant boundary
 *      means a seller's deletion request is a scoped delete, not a surgical
 *      edit of a shared row.
 *
 * The same human signing up at two storefronts gets two Customer rows with the
 * same email. That is correct, not duplication: they are two relationships.
 */

import mongoose, { Schema, type Model, type Types } from 'mongoose';
import type { Timestamps } from './timestamps';
import { tenantScopePlugin } from '../plugins/tenantScope';

export type CustomerStatus = 'active' | 'blocked';

export interface CustomerAttributes extends Timestamps {
  _id: Types.ObjectId;
  siteId: Types.ObjectId;
  email: string;
  /** argon2id hash. `select: false` — never travels unless explicitly asked for. */
  passwordHash?: string;
  name: string;
  phone?: string;
  emailVerifiedAt?: Date | null;
  status: CustomerStatus;
  lastLoginAt?: Date | null;
  failedLoginAttempts: number;
  lockedUntil?: Date | null;
}

const customerSchema = new Schema<CustomerAttributes>(
  {
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 320,
    },
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 32 },
    emailVerifiedAt: { type: Date, default: null },
    status: {
      type: String,
      required: true,
      enum: ['active', 'blocked'],
      default: 'active',
      index: true,
    },
    lastLoginAt: { type: Date, default: null },
    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.passwordHash;
        return ret;
      },
    },
  },
);

customerSchema.plugin(tenantScopePlugin, { modelName: 'Customer' });

// Unique per store, NOT globally. The compound index is what makes "one person,
// two storefronts, two accounts" work while still refusing a duplicate signup
// on the same store.
customerSchema.index({ siteId: 1, email: 1 }, { unique: true });

export const Customer: Model<CustomerAttributes> =
  (mongoose.models.Customer as Model<CustomerAttributes>) ??
  mongoose.model<CustomerAttributes>('Customer', customerSchema);

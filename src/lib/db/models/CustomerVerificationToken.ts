/**
 * Email-confirmation links for shoppers (Customer), one store at a time.
 *
 * Separate from VerificationToken because that one belongs to a User, who
 * spans stores, and is not tenant-scoped. A shopper's link belongs to the
 * store they signed up at: tenant-scoped like the Customer it confirms, so a
 * link issued by one store cannot be redeemed on another — the lookup simply
 * does not see it.
 *
 * Only a SHA-256 digest of the token is stored, as for every other token.
 */

import mongoose, { Schema, type Model, type Types } from 'mongoose';
import type { Timestamps } from './timestamps';
import { tenantScopePlugin } from '../plugins/tenantScope';

export interface CustomerVerificationTokenAttributes extends Timestamps {
  _id: Types.ObjectId;
  siteId: Types.ObjectId;
  customerId: Types.ObjectId;
  tokenHash: string;
  /** The address the link was sent to; a changed address makes the link invalid. */
  email: string;
  expiresAt: Date;
  consumedAt?: Date | null;
}

const schema = new Schema<CustomerVerificationTokenAttributes>(
  {
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 320 },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

schema.plugin(tenantScopePlugin, { modelName: 'CustomerVerificationToken' });

// Mongo reaps expired links.
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const CustomerVerificationToken: Model<CustomerVerificationTokenAttributes> =
  (mongoose.models.CustomerVerificationToken as Model<CustomerVerificationTokenAttributes>) ??
  mongoose.model<CustomerVerificationTokenAttributes>('CustomerVerificationToken', schema);

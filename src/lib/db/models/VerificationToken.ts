/**
 * Single-use, expiring tokens sent by email: address verification, and
 * password reset.
 *
 * Only a SHA-256 digest is stored, exactly as for sessions: a database dump
 * must not hand over the ability to verify someone else's address. SHA-256
 * rather than argon2 is right here because the token is 256 bits of CSPRNG
 * output — there is no low-entropy guess space for a slow hash to defend.
 *
 * Not tenant-scoped: it belongs to a User, and a User spans sites.
 */

import mongoose, { Schema, type Model, type Types } from 'mongoose';
import type { Timestamps } from './timestamps';

export type VerificationPurpose = 'email' | 'password_reset';

export interface VerificationTokenAttributes extends Timestamps {
  _id: Types.ObjectId;
  tokenHash: string;
  userId: Types.ObjectId;
  purpose: VerificationPurpose;
  /**
   * The address this token was issued for.
   *
   * Recorded so that changing your email after requesting a link cannot be
   * used to verify the new address with the old link.
   */
  email: string;
  expiresAt: Date;
  consumedAt?: Date | null;
}

const verificationTokenSchema = new Schema<VerificationTokenAttributes>(
  {
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    purpose: { type: String, required: true, enum: ['email', 'password_reset'], default: 'email' },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 320 },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Mongo reaps expired tokens. Application code should not have to sweep, and a
// missed sweep leaves usable credentials lying around.
verificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const VerificationToken: Model<VerificationTokenAttributes> =
  (mongoose.models.VerificationToken as Model<VerificationTokenAttributes>) ??
  mongoose.model<VerificationTokenAttributes>('VerificationToken', verificationTokenSchema);

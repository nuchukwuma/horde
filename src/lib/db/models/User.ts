/**
 * Platform-wide user account. Not tenant-scoped: one login can own or staff
 * several sites.
 *
 * Store customers are deliberately NOT Users — see models/Customer once the
 * store module lands. A buyer belongs to one storefront and may check out as a
 * guest, so conflating the two would force an account on every shopper and blur
 * a tenant boundary that matters.
 */

import mongoose, { Schema, type Model, type Types } from 'mongoose';
import type { Timestamps } from './timestamps';

export type PlatformRole = 'admin' | 'user';
export type UserStatus = 'active' | 'suspended';

export interface UserAttributes extends Timestamps {
  _id: Types.ObjectId;
  email: string;
  /** argon2id hash. `select: false` — never travels unless explicitly asked for. */
  passwordHash?: string;
  name: string;
  avatarUrl?: string;
  platformRole: PlatformRole;
  /** Which Terms + Privacy version they accepted, and when (lib/legal/terms.ts). */
  termsAcceptedVersion?: string | null;
  termsAcceptedAt?: Date | null;
  emailVerifiedAt?: Date | null;
  /** When the one "you haven't confirmed your email" reminder went (lib/email/reminders.ts). */
  verificationReminderSentAt?: Date | null;
  /** Set when they turn off setup tips (lib/email/nudges.ts). Never cleared by us. */
  nudgeOptOutAt?: Date | null;
  /** The last setup tip of any kind, so a seller with three stores still gets one every few days at most. */
  lastNudgeAt?: Date | null;
  status: UserStatus;
  lastLoginAt?: Date | null;
  failedLoginAttempts: number;
  lockedUntil?: Date | null;
}

const userSchema = new Schema<UserAttributes>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 320,
    },
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    avatarUrl: { type: String, trim: true },
    platformRole: {
      type: String,
      required: true,
      enum: ['admin', 'user'],
      default: 'user',
      index: true,
    },
    emailVerifiedAt: { type: Date, default: null },
    verificationReminderSentAt: { type: Date, default: null },
    nudgeOptOutAt: { type: Date, default: null },
    lastNudgeAt: { type: Date, default: null },
    termsAcceptedVersion: { type: String, default: null },
    termsAcceptedAt: { type: Date, default: null },
    status: {
      type: String,
      required: true,
      enum: ['active', 'suspended'],
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
        // Belt and braces: `select: false` already keeps the hash out of reads,
        // but a document built in memory would still carry it into a response.
        delete ret.passwordHash;
        return ret;
      },
    },
  },
);

export const User: Model<UserAttributes> =
  (mongoose.models.User as Model<UserAttributes>) ??
  mongoose.model<UserAttributes>('User', userSchema);

/**
 * Opaque server-side sessions.
 *
 * Chosen over stateless JWTs because a payments platform needs revocation that
 * takes effect now, not at token expiry: suspend a compromised account and every
 * session dies on the next request.
 *
 * Only a SHA-256 digest of the token is stored. A database dump therefore does
 * not hand over live sessions.
 */

import mongoose, { Schema, type Model, type Types } from 'mongoose';

export type SessionScope = 'platform' | 'storefront';

export interface SessionAttributes {
  _id: Types.ObjectId;
  tokenHash: string;
  userId: Types.ObjectId;
  /**
   * 'platform' sessions are for the dashboard on APP_HOST.
   * 'storefront' sessions belong to one tenant host and carry siteId.
   *
   * These never share a cookie: seller subdomains are attacker-controllable
   * origins, so a cookie valid across them would let any seller harvest
   * dashboard sessions.
   */
  scope: SessionScope;
  siteId?: Types.ObjectId | null;
  /**
   * Last time the user proved their password. Sensitive actions (changing bank
   * details) require this to be recent, independent of session age.
   */
  reauthenticatedAt: Date;
  ip?: string;
  userAgent?: string;
  expiresAt: Date;
  revokedAt?: Date | null;
}

const sessionSchema = new Schema<SessionAttributes>(
  {
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    scope: { type: String, required: true, enum: ['platform', 'storefront'] },
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', default: null },
    reauthenticatedAt: { type: Date, required: true, default: () => new Date() },
    ip: { type: String, trim: true, maxlength: 64 },
    userAgent: { type: String, trim: true, maxlength: 512 },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Mongo reaps expired sessions on its own; application code should not have to
// remember to sweep, and a missed sweep would leave live credentials around.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session: Model<SessionAttributes> =
  (mongoose.models.Session as Model<SessionAttributes>) ??
  mongoose.model<SessionAttributes>('Session', sessionSchema);

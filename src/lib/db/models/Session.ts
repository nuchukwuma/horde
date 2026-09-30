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
import type { Timestamps } from './timestamps';

export type SessionScope = 'platform' | 'storefront';

export interface SessionAttributes extends Timestamps {
  _id: Types.ObjectId;
  tokenHash: string;
  /** Set on 'platform' sessions only. A seller or admin. */
  userId?: Types.ObjectId | null;
  /** Set on 'storefront' sessions only. A shopper on one specific store. */
  customerId?: Types.ObjectId | null;
  /**
   * 'platform' sessions are for the dashboard on APP_HOST.
   * 'storefront' sessions belong to one tenant host and carry siteId.
   *
   * These never share a cookie: seller subdomains are attacker-controllable
   * origins, so a cookie valid across them would let any seller harvest
   * dashboard sessions.
   *
   * The scope also decides WHICH collection the subject lives in: a platform
   * session resolves to a User, a storefront session to a Customer. They are
   * different tables with different id spaces, so a storefront token replayed
   * against the dashboard cannot resolve to a user even by collision.
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
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', default: null, index: true },
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

/**
 * Exactly one subject, matching the scope.
 *
 * Both fields are optional at the schema level because neither is always
 * present, which would let a row be written with no subject at all, or with
 * both. A session carrying both a userId and a customerId is the kind of thing
 * an authorisation check reads whichever half suits it — so it is refused at
 * write time rather than reasoned about at every read.
 */
sessionSchema.pre('validate', function enforceSubject(next) {
  const hasUser = Boolean(this.userId);
  const hasCustomer = Boolean(this.customerId);

  if (this.scope === 'platform') {
    if (!hasUser) return next(new Error('A platform session requires a userId'));
    if (hasCustomer) return next(new Error('A platform session must not carry a customerId'));
  } else {
    if (!hasCustomer) return next(new Error('A storefront session requires a customerId'));
    if (hasUser) return next(new Error('A storefront session must not carry a userId'));
    if (!this.siteId) return next(new Error('A storefront session requires a siteId'));
  }

  return next();
});

// Mongo reaps expired sessions on its own; application code should not have to
// remember to sweep, and a missed sweep would leave live credentials around.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session: Model<SessionAttributes> =
  (mongoose.models.Session as Model<SessionAttributes>) ??
  mongoose.model<SessionAttributes>('Session', sessionSchema);

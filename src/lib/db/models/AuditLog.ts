/**
 * Append-only audit trail.
 *
 * `siteId` is nullable because platform-level actions (admin suspends a site,
 * admin flags prohibited products) have no tenant, so the tenant plugin is not
 * applied and siteId is set explicitly by the caller.
 *
 * Mandatory on every payout-detail change. That requirement is not bureaucratic:
 * "someone changed the bank account and then the money went elsewhere" is the
 * single most common marketplace fraud, and this collection is how it gets
 * detected and proven.
 */

import mongoose, { Schema, type Model, type Types } from 'mongoose';
import type { CreatedAt } from './timestamps';
import { appendOnlyPlugin } from '../plugins/appendOnly';

export type AuditAction =
  | 'payout.details.changed'
  | 'payout.verified'
  | 'payout.rejected'
  | 'site.created'
  | 'site.suspended'
  | 'site.reinstated'
  | 'site.prohibited_flag.set'
  | 'site.prohibited_flag.cleared'
  | 'site.settings.changed'
  | 'site.design.published'
  | 'site.slug.changed'
  | 'user.login'
  | 'user.login.failed'
  /** A signed-in seller re-confirmed their password before a sensitive action. */
  | 'user.step_up'
  | 'user.step_up.failed'
  | 'user.password.changed'
  /** Accepted a (new) version of the Terms and Privacy Policy. */
  | 'user.terms.accepted'
  /** A reset link was emailed; and the password was then reset from it. */
  | 'user.password_reset.requested'
  | 'user.password_reset.completed'
  | 'membership.granted'
  | 'membership.revoked'
  | 'order.refunded'
  | 'plan.changed'
  /** MrMouse: the owner agreed to share store details / withdrew it / changed stock sync. */
  | 'integration.mrmouse.connected'
  | 'integration.mrmouse.disconnected'
  | 'integration.mrmouse.stock_sync_changed'
  /** A signed sign-in pass naming this user was handed to MrMouse. */
  | 'integration.mrmouse.launched'
  /** Paystack reported an amount or currency that disagrees with the order. */
  | 'webhook.amount_mismatch';

export interface AuditLogAttributes extends CreatedAt {
  _id: Types.ObjectId;
  siteId?: Types.ObjectId | null;
  actorUserId?: Types.ObjectId | null;
  actorRole?: string;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  /**
   * Redacted before/after snapshots.
   *
   * Never put a full bank account number, password hash, session token, or API
   * key in here — an audit log is widely readable by design, which is exactly
   * what makes it a bad place for secrets.
   */
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ip?: string;
  userAgent?: string;
}

const auditLogSchema = new Schema<AuditLogAttributes>(
  {
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', default: null, index: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    actorRole: { type: String, trim: true },
    action: { type: String, required: true, index: true },
    targetType: { type: String, trim: true },
    targetId: { type: String, trim: true },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
    ip: { type: String, trim: true, maxlength: 64 },
    userAgent: { type: String, trim: true, maxlength: 512 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.plugin(appendOnlyPlugin, { modelName: 'AuditLog' });
auditLogSchema.index({ siteId: 1, action: 1, createdAt: -1 });

export const AuditLog: Model<AuditLogAttributes> =
  (mongoose.models.AuditLog as Model<AuditLogAttributes>) ??
  mongoose.model<AuditLogAttributes>('AuditLog', auditLogSchema);

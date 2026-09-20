/**
 * Links a User to a Site with a role. Kept separate from User so one account can
 * hold different roles across different sites without a nested array that has to
 * be filtered correctly every time.
 *
 * Not tenant-scoped by the plugin: authorisation has to be resolvable *before*
 * a tenant context exists, which is the thing that establishes it.
 */

import mongoose, { Schema, type Model, type Types } from 'mongoose';

export type SiteRole = 'owner' | 'staff';

export type StaffPermission =
  | 'products:read'
  | 'products:write'
  | 'orders:read'
  | 'orders:refund'
  | 'content:write'
  | 'settings:write'
  | 'payouts:read';

export interface MembershipAttributes {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  siteId: Types.ObjectId;
  role: SiteRole;
  permissions: StaffPermission[];
  invitedBy?: Types.ObjectId | null;
  acceptedAt?: Date | null;
}

const membershipSchema = new Schema<MembershipAttributes>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
    role: { type: String, required: true, enum: ['owner', 'staff'] },
    permissions: {
      type: [String],
      default: [],
      enum: [
        'products:read',
        'products:write',
        'orders:read',
        'orders:refund',
        'content:write',
        'settings:write',
        'payouts:read',
      ],
    },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    acceptedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

membershipSchema.index({ userId: 1, siteId: 1 }, { unique: true });

export const Membership: Model<MembershipAttributes> =
  (mongoose.models.Membership as Model<MembershipAttributes>) ??
  mongoose.model<MembershipAttributes>('Membership', membershipSchema);

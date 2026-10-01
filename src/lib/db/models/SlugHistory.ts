/**
 * Addresses a store used to have.
 *
 * When a seller changes their slug, the old one is recorded here and becomes
 * permanently unavailable. Two reasons, one practical and one security:
 *
 *   - Links already shared in WhatsApp statuses and bios keep working: the
 *     storefront redirects an old slug to the store's current address.
 *   - Nobody else can register the old address. If they could, every
 *     customer following an old link would land on a stranger's shop that
 *     looks like the one they meant to pay — a ready-made phishing page.
 *
 * Platform-level, not tenant-scoped: resolving an old slug is how we find
 * out which tenant it belonged to.
 */

import mongoose, { Schema, type Model, type Types } from 'mongoose';
import type { CreatedAt } from './timestamps';

export interface SlugHistoryAttributes extends CreatedAt {
  _id: Types.ObjectId;
  slug: string;
  siteId: Types.ObjectId;
  retiredBy: Types.ObjectId | null;
}

const slugHistorySchema = new Schema<SlugHistoryAttributes>(
  {
    slug: { type: String, required: true, lowercase: true, trim: true, unique: true },
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
    retiredBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const SlugHistory: Model<SlugHistoryAttributes> =
  (mongoose.models.SlugHistory as Model<SlugHistoryAttributes>) ??
  mongoose.model<SlugHistoryAttributes>('SlugHistory', slugHistorySchema);

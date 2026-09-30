/**
 * One thread between a shopper and a store. Tenant-scoped.
 *
 * Mutable, unlike Message: read state and the last-message summary change as
 * the thread moves. Keeping that here means the message log itself can be
 * append-only, which is what makes it usable as evidence.
 *
 * A conversation requires a Customer. Chat is the one place an account is not
 * optional — a thread has to belong to somebody we can authenticate on the
 * next visit, and "the person holding this browser" is not an identity we can
 * re-establish for a guest.
 */

import mongoose, { Schema, type Model, type Types } from 'mongoose';
import type { Timestamps } from './timestamps';
import { tenantScopePlugin } from '../plugins/tenantScope';

export type ConversationStatus = 'open' | 'closed';

export interface ConversationAttributes extends Timestamps {
  _id: Types.ObjectId;
  siteId: Types.ObjectId;
  customerId: Types.ObjectId;
  /** Set when the thread was started from an order, for context. */
  orderId?: Types.ObjectId | null;
  status: ConversationStatus;
  lastMessageAt: Date;
  /** First line of the latest message, for an inbox list without a join. */
  lastMessagePreview: string;
  unreadForSeller: number;
  unreadForCustomer: number;
  /** How many messages in this thread tripped the payment-risk detector. */
  flaggedMessageCount: number;
}

const conversationSchema = new Schema<ConversationAttributes>(
  {
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
    status: { type: String, required: true, enum: ['open', 'closed'], default: 'open' },
    lastMessageAt: { type: Date, required: true, default: () => new Date() },
    lastMessagePreview: { type: String, default: '', maxlength: 200 },
    unreadForSeller: { type: Number, default: 0, min: 0 },
    unreadForCustomer: { type: Number, default: 0, min: 0 },
    flaggedMessageCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

conversationSchema.plugin(tenantScopePlugin, { modelName: 'Conversation' });

// One thread per shopper per store. A second thread would split the history
// that a dispute needs to read as one sequence.
conversationSchema.index({ siteId: 1, customerId: 1 }, { unique: true });

// The seller's inbox ordering.
conversationSchema.index({ siteId: 1, lastMessageAt: -1 });

export const Conversation: Model<ConversationAttributes> =
  (mongoose.models.Conversation as Model<ConversationAttributes>) ??
  mongoose.model<ConversationAttributes>('Conversation', conversationSchema);

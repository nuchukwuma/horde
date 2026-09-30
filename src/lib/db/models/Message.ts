/**
 * A single message. Tenant-scoped and APPEND-ONLY.
 *
 * Append-only for the same reason as the ledger: this is the record a dispute
 * is argued from. A seller who could edit "send it to my account" out of the
 * thread after a complaint would destroy the only evidence of what happened,
 * and a buyer who could edit their side could manufacture it. Neither party
 * gets to rewrite what was said.
 *
 * So there is no edit and no delete. Read state and thread summaries live on
 * Conversation, which is mutable, precisely so this collection does not have
 * to be.
 *
 * Bodies are plain text, stripped of HTML on write. Chat is not a place
 * sellers need formatting, and every tag allowed here would be a tag rendered
 * into another person's browser on a domain that shares a registrable suffix
 * with the dashboard.
 */

import mongoose, { Schema, type Model, type Types } from 'mongoose';
import type { Timestamps } from './timestamps';
import { tenantScopePlugin } from '../plugins/tenantScope';
import { appendOnlyPlugin } from '../plugins/appendOnly';
import type { RiskSignal } from '../../chat/paymentRisk';

export type MessageSender = 'customer' | 'seller';

export interface MessageAttributes extends Timestamps {
  _id: Types.ObjectId;
  siteId: Types.ObjectId;
  conversationId: Types.ObjectId;
  senderType: MessageSender;
  /** Customer _id or User _id depending on senderType. */
  senderId: Types.ObjectId;
  body: string;
  /** Payment-risk signals at write time. Empty for an ordinary message. */
  riskSignals: RiskSignal[];
}

const messageSchema = new Schema<MessageAttributes>(
  {
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    senderType: { type: String, required: true, enum: ['customer', 'seller'] },
    senderId: { type: Schema.Types.ObjectId, required: true },
    body: { type: String, required: true, trim: true, maxlength: 4000 },
    riskSignals: { type: [String], default: [] },
  },
  { timestamps: true },
);

// Order matters, as on LedgerEntry: appendOnly must register before
// tenantScope so its guards sit outermost on the update and delete paths.
messageSchema.plugin(appendOnlyPlugin, { modelName: 'Message' });
messageSchema.plugin(tenantScopePlugin, { modelName: 'Message' });

messageSchema.index({ siteId: 1, conversationId: 1, createdAt: 1 });

export const Message: Model<MessageAttributes> =
  (mongoose.models.Message as Model<MessageAttributes>) ??
  mongoose.model<MessageAttributes>('Message', messageSchema);

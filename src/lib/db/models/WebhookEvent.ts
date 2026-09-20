/**
 * Inbound provider webhooks.
 *
 * Deliberately NOT tenant-scoped. Paystack posts every event to one platform
 * URL, and which site an event belongs to is only known after the payload has
 * been parsed and its order looked up. Applying the tenant plugin here would
 * make intake impossible.
 *
 * The unique index on (provider, eventId) is what makes retries safe: Paystack
 * redelivers on any non-2xx, and a duplicate insert fails rather than paying an
 * order out twice.
 */

import mongoose, { Schema, type Model, type Types } from 'mongoose';

export type WebhookStatus = 'received' | 'processing' | 'processed' | 'failed' | 'ignored';

export interface WebhookEventAttributes {
  _id: Types.ObjectId;
  provider: 'paystack';
  /** Provider's event id where available, else a digest of the raw body. */
  eventId: string;
  eventType: string;
  reference?: string | null;
  siteId?: Types.ObjectId | null;
  orderId?: Types.ObjectId | null;
  signatureVerified: boolean;
  /** Digest only. The raw body can contain cardholder detail we must not retain. */
  rawBodySha256: string;
  status: WebhookStatus;
  attempts: number;
  lastError?: string | null;
  receivedAt: Date;
  processedAt?: Date | null;
}

const webhookEventSchema = new Schema<WebhookEventAttributes>(
  {
    provider: { type: String, required: true, enum: ['paystack'], default: 'paystack' },
    eventId: { type: String, required: true, trim: true },
    eventType: { type: String, required: true, trim: true, index: true },
    reference: { type: String, trim: true, default: null, index: true },
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', default: null, index: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
    signatureVerified: { type: Boolean, required: true, default: false },
    rawBodySha256: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: ['received', 'processing', 'processed', 'failed', 'ignored'],
      default: 'received',
      index: true,
    },
    attempts: { type: Number, required: true, default: 0 },
    lastError: { type: String, default: null, maxlength: 2000 },
    receivedAt: { type: Date, required: true, default: () => new Date() },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

webhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });

export const WebhookEvent: Model<WebhookEventAttributes> =
  (mongoose.models.WebhookEvent as Model<WebhookEventAttributes>) ??
  mongoose.model<WebhookEventAttributes>('WebhookEvent', webhookEventSchema);

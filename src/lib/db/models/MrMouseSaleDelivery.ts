/**
 * A paid order's "these items left the shelf" message to MrMouse, kept until
 * MrMouse confirms it. Tenant-scoped.
 *
 * Sending once and hoping was not enough: MrMouse treats its own count as the
 * truth and pushes it back, so a lost sale would put sold items back on this
 * store's shelf. A row stays `pending` (retried with growing gaps) until a 2xx,
 * then `delivered`; after the last retry it is `failed` and the seller is told.
 * While a sale is not yet in MrMouse, stock pushes from MrMouse are reduced by
 * it (see applyMrMouseStock).
 *
 * `body` is the exact JSON sent: SKUs and quantities only — no customer
 * details and no amounts. It is re-signed on every attempt, because the
 * signature carries a timestamp MrMouse only accepts for five minutes.
 */

import mongoose, { Schema, type Model, type Types } from 'mongoose';
import type { Timestamps } from './timestamps';
import { tenantScopePlugin } from '../plugins/tenantScope';

export type MrMouseDeliveryStatus = 'pending' | 'delivered' | 'failed';

export interface MrMouseSaleItem {
  sku: string;
  quantity: number;
}

export interface MrMouseSaleDeliveryAttributes extends Timestamps {
  _id: Types.ObjectId;
  siteId: Types.ObjectId;
  orderId: Types.ObjectId;
  orderNumber: string;
  items: MrMouseSaleItem[];
  body: string;
  status: MrMouseDeliveryStatus;
  attempts: number;
  nextAttemptAt: Date | null;
  /** Held while one worker is sending, so two never send the same row at once. */
  lockedUntil: Date | null;
  /** HTTP status of the last attempt; 0 when MrMouse could not be reached. */
  lastStatus: number | null;
  deliveredAt: Date | null;
}

const itemSchema = new Schema<MrMouseSaleItem>(
  {
    sku: { type: String, required: true, maxlength: 64 },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const deliverySchema = new Schema<MrMouseSaleDeliveryAttributes>(
  {
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    orderNumber: { type: String, required: true },
    items: { type: [itemSchema], required: true },
    body: { type: String, required: true, maxlength: 64 * 1024 },
    status: { type: String, required: true, enum: ['pending', 'delivered', 'failed'], default: 'pending' },
    attempts: { type: Number, required: true, default: 0, min: 0 },
    nextAttemptAt: { type: Date, default: () => new Date() },
    lockedUntil: { type: Date, default: null },
    lastStatus: { type: Number, default: null },
    deliveredAt: { type: Date, default: null },
  },
  { timestamps: true },
);

deliverySchema.plugin(tenantScopePlugin, { modelName: 'MrMouseSaleDelivery' });

// One message per order: a webhook delivered twice must not queue two sales.
deliverySchema.index({ siteId: 1, orderNumber: 1 }, { unique: true });
// The retry worker's question: what is due, across all stores.
deliverySchema.index({ status: 1, nextAttemptAt: 1 });

export const MrMouseSaleDelivery: Model<MrMouseSaleDeliveryAttributes> =
  (mongoose.models.MrMouseSaleDelivery as Model<MrMouseSaleDeliveryAttributes>) ??
  mongoose.model<MrMouseSaleDeliveryAttributes>('MrMouseSaleDelivery', deliverySchema);

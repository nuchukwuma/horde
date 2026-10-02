/**
 * An order. Tenant-scoped.
 *
 * Two snapshots make this document self-contained, which matters because it is
 * the record a dispute is argued from years later:
 *
 *   items[]      — price and title as they were at purchase, so later edits to a
 *                  Product never rewrite what a customer actually agreed to pay
 *   feeSnapshot  — the plan's fee terms at purchase, so changing the Pro plan's
 *                  percentage next year does not restate historical economics
 */

import mongoose, { Schema, type Model, type Types } from 'mongoose';
import type { Timestamps } from './timestamps';
import { koboField } from '../../money/kobo';
import { tenantScopePlugin } from '../plugins/tenantScope';
import type { FeeBearer } from './Plan';

export type OrderStatus =
  | 'pending'
  | 'paid'
  | 'failed'
  | 'cancelled'
  | 'refunded'
  | 'partially_refunded'
  | 'disputed';

export interface OrderItem {
  productId: Types.ObjectId;
  title: string;
  unitPriceKobo: number;
  quantity: number;
  lineTotalKobo: number;
}

export interface OrderFeeSnapshot {
  planCode: string;
  feePercentBps: number;
  feeFlatKobo: number;
  feeCapKobo: number | null;
  vatOnPlatformFeeBps: number;
  paystackFeeBearer: FeeBearer;
}

export interface OrderSplit {
  grossKobo: number;
  platformFeeKobo: number;
  /** VAT charged on the platform fee. Zero until a tax adviser says otherwise. */
  platformFeeVatKobo: number;
  paystackFeeKobo: number;
  sellerNetKobo: number;
}

/**
 * Where to send the order. Personal data under the NDPA: shown to this
 * store's seller (and platform support), never to anyone else, and the
 * address is only stored when the shopper asked for delivery.
 */
export interface OrderDelivery {
  method: 'delivery' | 'pickup';
  address?: string;
  city?: string;
  state?: string;
  note?: string;
}

export interface OrderAttributes extends Timestamps {
  _id: Types.ObjectId;
  siteId: Types.ObjectId;
  orderNumber: string;
  customerId?: Types.ObjectId | null;
  customerEmail: string;
  customerName?: string;
  /** +234XXXXXXXXXX. Absent on orders placed before checkout asked for it. */
  customerPhone?: string;
  delivery?: OrderDelivery | null;
  /** When the seller marked it sent or collected. Null until then. */
  fulfilledAt?: Date | null;
  items: OrderItem[];
  subtotalKobo: number;
  shippingKobo: number;
  discountKobo: number;
  totalKobo: number;
  currency: 'NGN';
  feeSnapshot: OrderFeeSnapshot;
  split: OrderSplit;
  status: OrderStatus;
  paystack: {
    reference?: string;
    accessCode?: string;
    authorizationUrl?: string;
    transactionId?: string;
    channel?: string;
    paidAt?: Date | null;
    /** Amount Paystack reports. Compared against totalKobo before marking paid. */
    amountKobo?: number | null;
    currency?: string;
  };
}

const orderSchema = new Schema<OrderAttributes>(
  {
    orderNumber: { type: String, required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', default: null },
    customerEmail: { type: String, required: true, lowercase: true, trim: true, maxlength: 320 },
    customerName: { type: String, trim: true, maxlength: 200 },
    customerPhone: { type: String, trim: true, maxlength: 20 },
    delivery: {
      type: new Schema(
        {
          method: { type: String, required: true, enum: ['delivery', 'pickup'] },
          address: { type: String, trim: true, maxlength: 300 },
          city: { type: String, trim: true, maxlength: 100 },
          state: { type: String, trim: true, maxlength: 40 },
          note: { type: String, trim: true, maxlength: 500 },
        },
        { _id: false },
      ),
      default: null,
    },
    fulfilledAt: { type: Date, default: null },
    items: {
      type: [
        {
          _id: false,
          productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
          title: { type: String, required: true },
          unitPriceKobo: koboField({ required: true }),
          quantity: { type: Number, required: true, min: 1 },
          lineTotalKobo: koboField({ required: true }),
        },
      ],
      required: true,
      validate: {
        validator: (items: OrderItem[]) => items.length > 0,
        message: 'An order must contain at least one item',
      },
    },
    subtotalKobo: koboField({ required: true }),
    shippingKobo: koboField({ required: true, default: 0 }),
    discountKobo: koboField({ required: true, default: 0 }),
    totalKobo: koboField({ required: true }),
    currency: { type: String, required: true, enum: ['NGN'], default: 'NGN' },
    feeSnapshot: {
      planCode: { type: String, required: true },
      feePercentBps: { type: Number, required: true },
      feeFlatKobo: koboField({ required: true, default: 0 }),
      feeCapKobo: { ...koboField(), default: null },
      vatOnPlatformFeeBps: { type: Number, required: true, default: 0 },
      paystackFeeBearer: { type: String, required: true, enum: ['platform', 'seller'] },
    },
    split: {
      grossKobo: koboField({ required: true }),
      platformFeeKobo: koboField({ required: true }),
      platformFeeVatKobo: koboField({ required: true, default: 0 }),
      paystackFeeKobo: koboField({ required: true, default: 0 }),
      sellerNetKobo: koboField({ required: true }),
    },
    status: {
      type: String,
      required: true,
      enum: [
        'pending',
        'paid',
        'failed',
        'cancelled',
        'refunded',
        'partially_refunded',
        'disputed',
      ],
      default: 'pending',
    },
    paystack: {
      reference: { type: String, trim: true },
      accessCode: { type: String, trim: true },
      authorizationUrl: { type: String, trim: true },
      transactionId: { type: String, trim: true },
      channel: { type: String, trim: true },
      paidAt: { type: Date, default: null },
      amountKobo: { ...koboField(), default: null },
      currency: { type: String, trim: true },
    },
  },
  { timestamps: true },
);

orderSchema.plugin(tenantScopePlugin, { modelName: 'Order' });

orderSchema.index({ siteId: 1, orderNumber: 1 }, { unique: true });
orderSchema.index({ siteId: 1, status: 1, createdAt: -1 });
orderSchema.index({ siteId: 1, customerEmail: 1, createdAt: -1 });

/**
 * Globally unique, not scoped to a site.
 *
 * Paystack references are unique across the platform, and the webhook handler
 * looks an order up by reference alone — at that point no tenant is known yet.
 * A per-site index would not prevent one site from claiming another's reference.
 */
orderSchema.index(
  { 'paystack.reference': 1 },
  { unique: true, partialFilterExpression: { 'paystack.reference': { $type: 'string' } } },
);

export const Order: Model<OrderAttributes> =
  (mongoose.models.Order as Model<OrderAttributes>) ??
  mongoose.model<OrderAttributes>('Order', orderSchema);

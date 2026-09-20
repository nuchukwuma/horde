/**
 * Store product. Tenant-scoped.
 *
 * `priceKobo` here is the only authoritative price. Checkout re-reads it from
 * this collection and ignores anything the client sent, so a tampered cart
 * cannot change what is charged.
 */

import mongoose, { Schema, type Model, type Types } from 'mongoose';
import { koboField } from '../../money/kobo';
import { tenantScopePlugin } from '../plugins/tenantScope';

export type ProductStatus = 'draft' | 'active' | 'archived';
export type InventoryPolicy = 'deny' | 'continue';

export interface ProductImage {
  cloudinaryPublicId: string;
  url: string;
  width?: number;
  height?: number;
  alt?: string;
}

export interface ProductAttributes {
  _id: Types.ObjectId;
  siteId: Types.ObjectId;
  title: string;
  slug: string;
  /** Sanitised at write time. Never store raw seller HTML. */
  descriptionHtml?: string;
  images: ProductImage[];
  priceKobo: number;
  compareAtPriceKobo?: number | null;
  sku?: string;
  inventory: {
    track: boolean;
    quantity: number;
    policy: InventoryPolicy;
  };
  status: ProductStatus;
  weightGrams?: number | null;
}

const productSchema = new Schema<ProductAttributes>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, lowercase: true, trim: true, maxlength: 200 },
    descriptionHtml: { type: String, maxlength: 50_000 },
    images: {
      type: [
        {
          _id: false,
          cloudinaryPublicId: { type: String, required: true },
          url: { type: String, required: true },
          width: Number,
          height: Number,
          alt: { type: String, maxlength: 300 },
        },
      ],
      default: [],
    },
    priceKobo: koboField({ required: true }),
    compareAtPriceKobo: { ...koboField(), default: null },
    sku: { type: String, trim: true, maxlength: 64 },
    inventory: {
      track: { type: Boolean, default: false },
      quantity: { type: Number, default: 0, min: 0 },
      policy: { type: String, enum: ['deny', 'continue'], default: 'deny' },
    },
    status: {
      type: String,
      required: true,
      enum: ['draft', 'active', 'archived'],
      default: 'draft',
    },
    weightGrams: { type: Number, default: null, min: 0 },
  },
  { timestamps: true },
);

productSchema.plugin(tenantScopePlugin, { modelName: 'Product' });

productSchema.index({ siteId: 1, slug: 1 }, { unique: true });
productSchema.index({ siteId: 1, status: 1, createdAt: -1 });

export const Product: Model<ProductAttributes> =
  (mongoose.models.Product as Model<ProductAttributes>) ??
  mongoose.model<ProductAttributes>('Product', productSchema);

/**
 * Subscription plans and their fee rules.
 *
 * Stored in the database rather than hardcoded so pricing can change without a
 * deploy. Orders snapshot the terms they were created under, so editing a Plan
 * never rewrites the economics of a sale that already happened.
 */

import mongoose, { Schema, type Model } from 'mongoose';
import type { Timestamps } from './timestamps';
import { koboField } from '../../money/kobo';

export type PlanCode = 'free' | 'pro';
export type FeeBearer = 'platform' | 'seller';

export interface PlanLimits {
  products: number | null;
  staff: number | null;
  storageMb: number | null;
  customDomain: boolean;
  modules: Array<'store' | 'portfolio' | 'blog'>;
}

export interface PlanAttributes extends Timestamps {
  code: PlanCode;
  name: string;
  /** Platform commission in basis points. 500 = 5%. */
  feePercentBps: number;
  /** Flat component added to the percentage component. */
  feeFlatKobo: number;
  /** Upper bound on total commission per order. null = uncapped. */
  feeCapKobo: number | null;
  /** Who absorbs Paystack's own processing charge. */
  paystackFeeBearer: FeeBearer;
  /**
   * VAT applied to our platform fee, in basis points.
   *
   * Defaults to 0 deliberately: charging VAT you are not registered to remit is
   * worse than not charging it. Set this only once a tax adviser has confirmed
   * the obligation and the registration is in place.
   */
  vatOnPlatformFeeBps: number;
  limits: PlanLimits;
  active: boolean;
}

const planSchema = new Schema<PlanAttributes>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      enum: ['free', 'pro'],
      lowercase: true,
      trim: true,
    },
    name: { type: String, required: true, trim: true },
    feePercentBps: {
      type: Number,
      required: true,
      min: 0,
      max: 10_000,
      validate: {
        validator: Number.isInteger,
        message: 'feePercentBps must be an integer number of basis points',
      },
    },
    feeFlatKobo: koboField({ required: true, default: 0 }),
    feeCapKobo: { ...koboField(), default: null },
    paystackFeeBearer: {
      type: String,
      required: true,
      enum: ['platform', 'seller'],
      default: 'seller',
    },
    vatOnPlatformFeeBps: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 10_000,
      validate: {
        validator: Number.isInteger,
        message: 'vatOnPlatformFeeBps must be an integer number of basis points',
      },
    },
    limits: {
      products: { type: Number, default: null },
      staff: { type: Number, default: null },
      storageMb: { type: Number, default: null },
      customDomain: { type: Boolean, default: false },
      modules: {
        type: [String],
        enum: ['store', 'portfolio', 'blog'],
        default: ['store', 'portfolio', 'blog'],
      },
    },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

export const Plan: Model<PlanAttributes> =
  (mongoose.models.Plan as Model<PlanAttributes>) ??
  mongoose.model<PlanAttributes>('Plan', planSchema);

/**
 * Append-only financial journal. Tenant-scoped.
 *
 * Rules, enforced by the appendOnly plugin rather than by discipline:
 *   - entries are written once and never edited or deleted
 *   - a mistake is corrected by writing a reversing entry that references the
 *     original, so the error and its correction are both visible
 *   - a state change (pending sale becomes settled) is a NEW entry sharing the
 *     original's groupId, not an edit to the old one
 *
 * The balance of an order is therefore the sum of its entries, and the history
 * of how it got there is never destroyed.
 */

import mongoose, { Schema, type Model, type Types } from 'mongoose';
import type { CreatedAt } from './timestamps';
import { koboField } from '../../money/kobo';
import { tenantScopePlugin } from '../plugins/tenantScope';
import { appendOnlyPlugin } from '../plugins/appendOnly';

export type LedgerEntryType =
  | 'sale'
  | 'refund'
  | 'reversal'
  | 'adjustment'
  | 'settlement'
  | 'chargeback'
  | 'fee';

export type LedgerStatus = 'pending' | 'settled' | 'failed' | 'reversed';

export interface LedgerEntryAttributes extends CreatedAt {
  _id: Types.ObjectId;
  siteId: Types.ObjectId;
  orderId?: Types.ObjectId | null;
  /** Ties an original entry to every correction and settlement that follows it. */
  groupId: Types.ObjectId;
  entryType: LedgerEntryType;
  /** Amounts are signed: a refund carries negatives so a plain sum is the balance. */
  grossKobo: number;
  providerFeeKobo: number;
  platformCommissionKobo: number;
  platformCommissionVatKobo: number;
  sellerNetKobo: number;
  currency: 'NGN';
  status: LedgerStatus;
  paystack: {
    reference?: string;
    transactionId?: string;
    settlementId?: string;
  };
  reversesEntryId?: Types.ObjectId | null;
  /** Free-text reason. Required on adjustments and reversals. */
  memo?: string;
  createdBy?: Types.ObjectId | null;
}

const ledgerEntrySchema = new Schema<LedgerEntryAttributes>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null, index: true },
    groupId: { type: Schema.Types.ObjectId, required: true, index: true },
    entryType: {
      type: String,
      required: true,
      enum: ['sale', 'refund', 'reversal', 'adjustment', 'settlement', 'chargeback', 'fee'],
    },
    grossKobo: koboField({ required: true, default: 0, allowNegative: true }),
    providerFeeKobo: koboField({ required: true, default: 0, allowNegative: true }),
    platformCommissionKobo: koboField({ required: true, default: 0, allowNegative: true }),
    platformCommissionVatKobo: koboField({ required: true, default: 0, allowNegative: true }),
    sellerNetKobo: koboField({ required: true, default: 0, allowNegative: true }),
    currency: { type: String, required: true, enum: ['NGN'], default: 'NGN' },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'settled', 'failed', 'reversed'],
    },
    paystack: {
      reference: { type: String, trim: true, index: true, sparse: true },
      transactionId: { type: String, trim: true },
      settlementId: { type: String, trim: true, index: true, sparse: true },
    },
    reversesEntryId: { type: Schema.Types.ObjectId, ref: 'LedgerEntry', default: null },
    memo: { type: String, trim: true, maxlength: 500 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

// appendOnly first: hooks run in registration order, and "this collection is
// append-only" is the more specific, more actionable message for a caller who
// tried to update a row that is also tenant-scoped.
ledgerEntrySchema.plugin(appendOnlyPlugin, { modelName: 'LedgerEntry' });
ledgerEntrySchema.plugin(tenantScopePlugin, { modelName: 'LedgerEntry' });

ledgerEntrySchema.index({ siteId: 1, createdAt: -1 });
ledgerEntrySchema.index({ siteId: 1, entryType: 1, createdAt: -1 });

ledgerEntrySchema.pre('validate', function requireMemoForCorrections() {
  const entry = this as unknown as LedgerEntryAttributes;
  const needsMemo = entry.entryType === 'adjustment' || entry.entryType === 'reversal';
  if (needsMemo && !entry.memo?.trim()) {
    this.invalidate('memo', `${entry.entryType} entries require a memo explaining the correction`);
  }
  if (entry.entryType === 'reversal' && !entry.reversesEntryId) {
    this.invalidate('reversesEntryId', 'a reversal must reference the entry it reverses');
  }
});

export const LedgerEntry: Model<LedgerEntryAttributes> =
  (mongoose.models.LedgerEntry as Model<LedgerEntryAttributes>) ??
  mongoose.model<LedgerEntryAttributes>('LedgerEntry', ledgerEntrySchema);

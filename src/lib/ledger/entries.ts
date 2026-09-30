/**
 * Ledger writers.
 *
 * Every function here only ever inserts. There is no update path and no delete
 * path, because the schema refuses both — a correction is a new entry that
 * points at the one it corrects.
 *
 * Amounts are signed. Money leaving the platform (a refund, a reversal) is
 * negative, so the balance of a group is a plain sum rather than a rule about
 * which entry types to subtract.
 */

import { Types } from 'mongoose';
import { LedgerEntry, type LedgerEntryAttributes } from '../db/models/LedgerEntry';
import type { RefundSplit } from '../payments/refundPolicy';

export interface SaleEntryInput {
  orderId: Types.ObjectId;
  groupId?: Types.ObjectId;
  grossKobo: number;
  providerFeeKobo: number;
  platformCommissionKobo: number;
  platformCommissionVatKobo: number;
  sellerNetKobo: number;
  reference: string;
  transactionId?: string;
}

/** The sale itself, written when a charge is confirmed. Status starts pending. */
export async function recordSale(input: SaleEntryInput): Promise<LedgerEntryAttributes> {
  return LedgerEntry.create({
    orderId: input.orderId,
    groupId: input.groupId ?? new Types.ObjectId(),
    entryType: 'sale',
    grossKobo: input.grossKobo,
    providerFeeKobo: input.providerFeeKobo,
    platformCommissionKobo: input.platformCommissionKobo,
    platformCommissionVatKobo: input.platformCommissionVatKobo,
    sellerNetKobo: input.sellerNetKobo,
    status: 'pending',
    paystack: { reference: input.reference, transactionId: input.transactionId },
  });
}

/**
 * Settlement of a sale.
 *
 * A new entry rather than flipping the sale's status, so the history shows both
 * that the sale happened and when the money actually landed. Carries no amounts
 * of its own — nothing moved, it was confirmed.
 */
export async function recordSettlement(input: {
  groupId: Types.ObjectId;
  orderId?: Types.ObjectId | null;
  sellerNetKobo: number;
  reference?: string;
  settlementId?: string;
}): Promise<LedgerEntryAttributes> {
  return LedgerEntry.create({
    orderId: input.orderId ?? null,
    groupId: input.groupId,
    entryType: 'settlement',
    grossKobo: 0,
    providerFeeKobo: 0,
    platformCommissionKobo: 0,
    platformCommissionVatKobo: 0,
    sellerNetKobo: input.sellerNetKobo,
    status: 'settled',
    paystack: { reference: input.reference, settlementId: input.settlementId },
  });
}

/**
 * A refund, priced by the policy in `refundPolicy.ts`.
 *
 * Signs: gross is negative because money left. The commission figures are
 * negative by the amount RETURNED — a `retain` policy therefore writes zero
 * there, which is the honest record of "we kept it".
 *
 * `providerFeeKobo` is zero: Paystack does not return its fee, so the original
 * sale's fee entry still stands and nothing reverses it.
 */
export async function recordRefund(input: {
  groupId: Types.ObjectId;
  orderId: Types.ObjectId;
  split: RefundSplit;
  reference?: string;
  transactionId?: string;
  createdBy?: Types.ObjectId | null;
}): Promise<LedgerEntryAttributes> {
  const { split } = input;

  return LedgerEntry.create({
    orderId: input.orderId,
    groupId: input.groupId,
    entryType: 'refund',
    grossKobo: -split.refundAmountKobo,
    providerFeeKobo: 0,
    platformCommissionKobo: -split.commissionReturnedKobo,
    platformCommissionVatKobo: -split.vatReturnedKobo,
    sellerNetKobo: -split.sellerDebitKobo,
    status: 'settled',
    memo:
      `Refund under policy "${split.policy}": platform ${split.platformDebitKobo} kobo, ` +
      `seller ${split.sellerDebitKobo} kobo`,
    paystack: { reference: input.reference, transactionId: input.transactionId },
    createdBy: input.createdBy ?? null,
  });
}

/**
 * Reverse an entry that should not have been written.
 *
 * For correcting OUR mistakes — a double-recorded sale, a wrong amount. A
 * refund is not a reversal: a refund is a real event that happened, and erasing
 * it from the arithmetic would misstate history.
 */
export async function recordReversal(input: {
  original: LedgerEntryAttributes;
  memo: string;
  createdBy?: Types.ObjectId | null;
}): Promise<LedgerEntryAttributes> {
  const { original } = input;

  return LedgerEntry.create({
    orderId: original.orderId ?? null,
    groupId: original.groupId,
    entryType: 'reversal',
    reversesEntryId: original._id,
    grossKobo: -original.grossKobo,
    providerFeeKobo: -original.providerFeeKobo,
    platformCommissionKobo: -original.platformCommissionKobo,
    platformCommissionVatKobo: -original.platformCommissionVatKobo,
    sellerNetKobo: -original.sellerNetKobo,
    status: 'reversed',
    memo: input.memo,
    paystack: original.paystack,
    createdBy: input.createdBy ?? null,
  });
}

/**
 * A manual correction with no counterpart event.
 *
 * Requires a memo, enforced by the schema. An adjustment without a stated
 * reason is indistinguishable from someone quietly moving money.
 */
export async function recordAdjustment(input: {
  groupId?: Types.ObjectId;
  orderId?: Types.ObjectId | null;
  grossKobo?: number;
  platformCommissionKobo?: number;
  sellerNetKobo?: number;
  memo: string;
  createdBy?: Types.ObjectId | null;
}): Promise<LedgerEntryAttributes> {
  return LedgerEntry.create({
    orderId: input.orderId ?? null,
    groupId: input.groupId ?? new Types.ObjectId(),
    entryType: 'adjustment',
    grossKobo: input.grossKobo ?? 0,
    providerFeeKobo: 0,
    platformCommissionKobo: input.platformCommissionKobo ?? 0,
    platformCommissionVatKobo: 0,
    sellerNetKobo: input.sellerNetKobo ?? 0,
    status: 'settled',
    memo: input.memo,
    createdBy: input.createdBy ?? null,
  });
}

/**
 * Paystack refund and transaction-listing operations.
 *
 * Refund creation is NOT retried. Paystack's refund endpoint is not idempotent,
 * and a retried timeout can issue a second refund to the same customer — money
 * out the door twice, recoverable only by asking for it back.
 */

import { paystackRequest } from './client';
import type { PaystackCallOptions } from './accounts';

export interface CreateRefundInput {
  /** Our transaction reference, or Paystack's transaction id. */
  transaction: string;
  /**
   * Amount in kobo. Omit for a full refund.
   *
   * We always send it explicitly: relying on "omit means full" makes a partial
   * refund one forgotten field away from a full one.
   */
  amountKobo: number;
  merchantNote?: string;
  customerNote?: string;
}

export interface PaystackRefund {
  id: number;
  status: string;
  /** Kobo. */
  amount: number;
  currency: string;
  transaction?: { id?: number; reference?: string };
  createdAt?: string;
}

export async function createRefund(
  input: CreateRefundInput,
  options: PaystackCallOptions = {},
): Promise<PaystackRefund> {
  return paystackRequest<PaystackRefund>({
    method: 'POST',
    path: '/refund',
    body: {
      transaction: input.transaction,
      amount: input.amountKobo,
      merchant_note: input.merchantNote,
      customer_note: input.customerNote,
    },
    retry: false,
    config: options.config,
  });
}

export interface TransactionListItem {
  id: number;
  reference: string;
  status: string;
  /** Kobo. */
  amount: number;
  currency: string;
  /** Paystack's processing fee, kobo. */
  fees?: number | null;
  paid_at?: string | null;
  created_at?: string | null;
  subaccount?: { subaccount_code?: string } | null;
}

export interface ListTransactionsFilter {
  from?: Date;
  to?: Date;
  status?: 'success' | 'failed' | 'abandoned';
  perPage?: number;
  page?: number;
}

/** One page of transactions. Reconciliation walks pages via `listAllTransactions`. */
export async function listTransactions(
  filter: ListTransactionsFilter = {},
  options: PaystackCallOptions = {},
): Promise<TransactionListItem[]> {
  const query = new URLSearchParams({
    perPage: String(filter.perPage ?? 100),
    page: String(filter.page ?? 1),
  });

  if (filter.from) query.set('from', filter.from.toISOString());
  if (filter.to) query.set('to', filter.to.toISOString());
  if (filter.status) query.set('status', filter.status);

  return paystackRequest<TransactionListItem[]>({
    method: 'GET',
    path: `/transaction?${query.toString()}`,
    retry: true,
    config: options.config,
  });
}

/**
 * Walk every page in a window.
 *
 * `maxPages` is a stop, not a suggestion: a paging bug that never returns an
 * empty page would otherwise spin against Paystack until something else breaks.
 */
export async function listAllTransactions(
  filter: ListTransactionsFilter = {},
  options: PaystackCallOptions & { maxPages?: number } = {},
): Promise<TransactionListItem[]> {
  const perPage = filter.perPage ?? 100;
  const maxPages = options.maxPages ?? 100;
  const all: TransactionListItem[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const batch = await listTransactions({ ...filter, page, perPage }, options);
    all.push(...batch);

    if (batch.length < perPage) break;
  }

  return all;
}

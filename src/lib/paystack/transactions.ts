/**
 * Paystack transaction operations.
 *
 * Initialize is never retried: a retried initialize after a timeout can leave a
 * second live checkout session for the same order. Verify is retried, because
 * it is a read and the answer does not change.
 */

import { paystackRequest } from './client';
import type { PaystackCallOptions } from './accounts';

export interface InitializeTransactionInput {
  /** Amount in kobo. Paystack's field is `amount` and it is always minor units. */
  amountKobo: number;
  email: string;
  /** Our own reference. Must be unique platform-wide; it is our idempotency key. */
  reference: string;
  /** Seller subaccount the remainder settles into. */
  subaccount: string;
  /**
   * Flat platform commission in kobo, routed to the main account.
   *
   * Sent explicitly per transaction rather than relying on the subaccount's
   * percentage_charge, because a percentage cannot express a flat component or
   * a cap, and our plans have both.
   */
  transactionCharge: number;
  /**
   * Who absorbs Paystack's processing fee.
   * 'account' = the platform, 'subaccount' = the seller.
   */
  bearer: 'account' | 'subaccount';
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface InitializedTransaction {
  authorization_url: string;
  access_code: string;
  reference: string;
}

export interface VerifiedTransaction {
  id: number;
  status: string;
  reference: string;
  /** Amount actually charged, in kobo. Compare against the order before trusting it. */
  amount: number;
  currency: string;
  channel?: string;
  paid_at?: string | null;
  /** Paystack's actual processing fee for this transaction, in kobo. */
  fees?: number | null;
  customer?: { email?: string };
  authorization?: { last4?: string; brand?: string; bank?: string };
}

export async function initializeTransaction(
  input: InitializeTransactionInput,
  options: PaystackCallOptions = {},
): Promise<InitializedTransaction> {
  return paystackRequest<InitializedTransaction>({
    method: 'POST',
    path: '/transaction/initialize',
    body: {
      amount: input.amountKobo,
      email: input.email,
      reference: input.reference,
      currency: 'NGN',
      subaccount: input.subaccount,
      transaction_charge: input.transactionCharge,
      bearer: input.bearer,
      callback_url: input.callbackUrl,
      metadata: input.metadata,
    },
    retry: false,
    config: options.config,
  });
}

/**
 * Ask Paystack what actually happened to a transaction.
 *
 * This is the authoritative answer, not the webhook payload. Phase 4's handler
 * calls this before marking anything paid — a webhook body is attacker-shaped
 * input until Paystack itself confirms it.
 */
export async function verifyTransaction(
  reference: string,
  options: PaystackCallOptions = {},
): Promise<VerifiedTransaction> {
  return paystackRequest<VerifiedTransaction>({
    method: 'GET',
    path: `/transaction/verify/${encodeURIComponent(reference)}`,
    retry: true,
    config: options.config,
  });
}

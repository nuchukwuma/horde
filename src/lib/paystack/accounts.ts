/**
 * Paystack account and subaccount operations.
 *
 * Reads are retried; writes are not. Creating a subaccount twice leaves a
 * duplicate on Paystack's side that we cannot see from the failure, so a
 * retried POST turns a timeout into a mess someone has to clean up manually.
 */

import { paystackRequest, type PaystackConfig } from './client';
import type {
  CreateSubaccountInput,
  PaystackBank,
  PaystackSubaccount,
  ResolvedAccount,
} from './types';

export interface PaystackCallOptions {
  config?: PaystackConfig;
}

/** Banks that can receive a NUBAN transfer in Nigeria. */
export async function listBanks(options: PaystackCallOptions = {}): Promise<PaystackBank[]> {
  const banks = await paystackRequest<PaystackBank[]>({
    method: 'GET',
    path: '/bank?country=nigeria&perPage=100',
    retry: true,
    config: options.config,
  });

  return banks.filter((bank) => bank.active);
}

/**
 * Ask Paystack who owns an account number.
 *
 * This is the KYC step: the returned name comes from the banking system, not
 * from the seller, so it is the one piece of identity here that a seller cannot
 * simply type in.
 */
export async function resolveAccount(
  input: { accountNumber: string; bankCode: string },
  options: PaystackCallOptions = {},
): Promise<ResolvedAccount> {
  const query = new URLSearchParams({
    account_number: input.accountNumber,
    bank_code: input.bankCode,
  });

  return paystackRequest<ResolvedAccount>({
    method: 'GET',
    path: `/bank/resolve?${query.toString()}`,
    retry: true,
    config: options.config,
  });
}

/**
 * Create the subaccount that a seller's share of each sale settles into.
 *
 * Never retried — see the module comment.
 */
export async function createSubaccount(
  input: CreateSubaccountInput,
  options: PaystackCallOptions = {},
): Promise<PaystackSubaccount> {
  return paystackRequest<PaystackSubaccount>({
    method: 'POST',
    path: '/subaccount',
    body: input,
    retry: false,
    config: options.config,
  });
}

export async function fetchSubaccount(
  subaccountCode: string,
  options: PaystackCallOptions = {},
): Promise<PaystackSubaccount> {
  return paystackRequest<PaystackSubaccount>({
    method: 'GET',
    path: `/subaccount/${encodeURIComponent(subaccountCode)}`,
    retry: true,
    config: options.config,
  });
}

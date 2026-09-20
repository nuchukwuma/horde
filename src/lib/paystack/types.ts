/**
 * Paystack API contracts.
 *
 * Only the fields we actually consume are typed. Paystack returns more than
 * this; narrowing here means a change to a field we ignore cannot break us, and
 * a change to one we depend on shows up as a parse failure rather than
 * `undefined` flowing into a money calculation.
 */

/** Every Paystack response shares this envelope. */
export interface PaystackEnvelope<T> {
  status: boolean;
  message: string;
  data: T;
}

export interface PaystackBank {
  id: number;
  name: string;
  slug: string;
  code: string;
  currency: string;
  type: string;
  active: boolean;
}

export interface ResolvedAccount {
  account_number: string;
  account_name: string;
  bank_id?: number;
}

export interface PaystackSubaccount {
  id: number;
  subaccount_code: string;
  business_name: string;
  account_number: string;
  settlement_bank: string;
  percentage_charge: number;
  active: boolean;
  is_verified?: boolean;
  currency?: string;
}

export interface CreateSubaccountInput {
  business_name: string;
  bank_code: string;
  account_number: string;
  /**
   * Paystack's field name. It is the share the SUBACCOUNT receives, expressed
   * as a percentage of the transaction — not the platform's commission.
   *
   * We do not rely on it for per-order splits. Each transaction is initialized
   * with an explicit `transaction_charge` in kobo, computed by our own fee
   * engine, because a percentage field cannot express a flat component or a cap.
   * This is set to 100 so that a transaction initialized without an explicit
   * charge (which should never happen) fails safe by paying the seller, not us.
   */
  percentage_charge: number;
  primary_contact_email?: string;
  primary_contact_name?: string;
  primary_contact_phone?: string;
}

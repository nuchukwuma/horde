/**
 * Simulated Paystack webhook payloads.
 *
 * Shapes follow Paystack's documented webhook bodies, trimmed to the fields we
 * read plus enough surrounding noise to prove we tolerate fields we ignore.
 * Signing uses the real HMAC path, so a change to the signature algorithm
 * breaks these tests rather than passing by construction.
 */

import { computePaystackSignature } from '../../src/lib/paystack/webhookSignature';

export const TEST_SECRET = 'sk_test_webhook_secret';

export interface SignedPayload {
  rawBody: string;
  signature: string;
}

/** Serialise and sign, returning exactly the bytes a handler would receive. */
export function sign(body: unknown, secret = TEST_SECRET): SignedPayload {
  const rawBody = JSON.stringify(body);
  return { rawBody, signature: computePaystackSignature(rawBody, secret) };
}

export function chargeSuccess(options: {
  reference: string;
  amountKobo: number;
  transactionId?: number;
  currency?: string;
  feesKobo?: number;
}) {
  return {
    event: 'charge.success',
    data: {
      id: options.transactionId ?? 302961,
      domain: 'test',
      status: 'success',
      reference: options.reference,
      amount: options.amountKobo,
      currency: options.currency ?? 'NGN',
      channel: 'card',
      paid_at: '2026-09-20T10:00:00.000Z',
      created_at: '2026-09-20T09:59:00.000Z',
      fees: options.feesKobo ?? 15_000,
      // Fields we deliberately do not read, present to prove we tolerate them.
      ip_address: '41.58.0.1',
      metadata: { custom_fields: [] },
      log: { time_spent: 9, attempts: 1 },
      customer: {
        id: 84312,
        email: 'buyer@example.com',
        customer_code: 'CUS_test',
      },
      authorization: {
        authorization_code: 'AUTH_test',
        last4: '4081',
        brand: 'visa',
        bank: 'TEST BANK',
      },
    },
  };
}

export function chargeFailed(options: { reference: string; amountKobo: number }) {
  return {
    event: 'charge.failed',
    data: {
      id: 302962,
      status: 'failed',
      reference: options.reference,
      amount: options.amountKobo,
      currency: 'NGN',
      gateway_response: 'Insufficient funds',
      customer: { email: 'buyer@example.com' },
    },
  };
}

export function refundProcessed(options: { reference: string; amountKobo: number }) {
  return {
    event: 'refund.processed',
    data: {
      id: 550,
      status: 'processed',
      amount: options.amountKobo,
      currency: 'NGN',
      // Refund payloads nest the original transaction rather than carrying a
      // top-level reference.
      transaction: { reference: options.reference, id: 302961 },
    },
  };
}

export function disputeOpened(options: { reference: string }) {
  return {
    event: 'charge.dispute.create',
    data: {
      id: 771,
      status: 'awaiting-merchant-feedback',
      category: 'chargeback',
      transaction: { reference: options.reference, id: 302961 },
    },
  };
}

/** An event type we do not handle, to prove unknown types are recorded not dropped. */
export function unknownEvent() {
  return {
    event: 'subscription.create',
    data: { id: 9001, subscription_code: 'SUB_test', status: 'active' },
  };
}

/** Paystack's verify endpoint response, for stubbing fetch. */
export function verifyResponse(options: {
  reference: string;
  amountKobo: number;
  status?: string;
  currency?: string;
  feesKobo?: number;
  transactionId?: number;
}) {
  return {
    status: true,
    message: 'Verification successful',
    data: {
      id: options.transactionId ?? 302961,
      status: options.status ?? 'success',
      reference: options.reference,
      amount: options.amountKobo,
      currency: options.currency ?? 'NGN',
      channel: 'card',
      paid_at: '2026-09-20T10:00:00.000Z',
      fees: options.feesKobo ?? 15_000,
      customer: { email: 'buyer@example.com' },
    },
  };
}

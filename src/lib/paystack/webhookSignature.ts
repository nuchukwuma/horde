/**
 * Paystack webhook signature verification.
 *
 * Paystack signs the raw request body with HMAC-SHA512 keyed on the secret key,
 * hex-encoded, in the x-paystack-signature header.
 *
 * Two things make or break this:
 *
 *   1. The signature covers the EXACT bytes sent. Parsing the body to JSON and
 *      re-serialising it reorders keys and drops whitespace, producing a
 *      different digest. Always verify the raw text.
 *   2. Comparison is constant-time. A byte-by-byte comparison that returns early
 *      leaks, through timing, how much of a guessed signature was correct.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export const PAYSTACK_SIGNATURE_HEADER = 'x-paystack-signature';

/** SHA-512 hex output is 128 characters. */
const SIGNATURE_LENGTH = 128;

export function computePaystackSignature(rawBody: string, secretKey: string): string {
  return createHmac('sha512', secretKey).update(rawBody, 'utf8').digest('hex');
}

/**
 * True only if `signature` is Paystack's signature over exactly `rawBody`.
 *
 * Never throws. A malformed header is a `false`, not a 500 — an attacker should
 * not be able to turn our error handler into an oracle.
 */
export function verifyPaystackSignature(
  rawBody: string,
  signature: string | null | undefined,
  secretKey = process.env.PAYSTACK_SECRET_KEY,
): boolean {
  if (!secretKey) {
    throw new Error('PAYSTACK_SECRET_KEY is not configured; cannot verify webhooks');
  }

  if (!signature) return false;

  const candidate = signature.trim().toLowerCase();
  if (candidate.length !== SIGNATURE_LENGTH) return false;
  if (!/^[a-f0-9]+$/.test(candidate)) return false;

  const expected = computePaystackSignature(rawBody, secretKey);

  // Both are now known to be 128 hex characters, so timingSafeEqual cannot
  // throw on a length mismatch.
  return timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(expected, 'hex'));
}

/**
 * Webhook signature verification and event classification.
 *
 * User journeys these tests encode:
 *
 *  1. As the platform, I only act on webhooks Paystack actually sent, so an
 *     attacker cannot mark their own order paid by POSTing to our endpoint.
 *  2. As the platform, Paystack's retries are harmless, so a redelivered
 *     charge.success does not pay a seller twice.
 *  3. As the platform, I know which events I understand and which I am
 *     deliberately ignoring, so a new Paystack event type is recorded rather
 *     than silently dropped.
 *
 * The signature tests pin the algorithm with a literal digest. An accidental
 * switch from SHA-512 to SHA-256 would still "work" in a round-trip test that
 * computes the expected value the same wrong way.
 */

import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  PAYSTACK_SIGNATURE_HEADER,
  verifyPaystackSignature,
} from '../../src/lib/paystack/webhookSignature';
import {
  classifyEvent,
  deriveEventId,
  parsePaystackEvent,
} from '../../src/lib/webhooks/paystackEvent';

const SECRET = 'sk_test_secret';
const BODY = '{"event":"charge.success","data":{"id":123}}';

/** HMAC-SHA512 of BODY under SECRET, computed independently. */
const VALID_SIGNATURE =
  'a1681b6e53886ca8369c49cdeec495f5d5f51a951b69dae8fa8c9374eaef1b25' +
  'c2a8977b04edb590679ef774c349ee9fa4be862a78bd29273227c71def517a6e';

describe('signature verification', () => {
  it('accepts a correct signature', () => {
    expect(verifyPaystackSignature(BODY, VALID_SIGNATURE, SECRET)).toBe(true);
  });

  it('uses HMAC-SHA512, not SHA-256', () => {
    const sha256 = createHmac('sha256', SECRET).update(BODY).digest('hex');
    expect(verifyPaystackSignature(BODY, sha256, SECRET)).toBe(false);
  });

  it('rejects a signature computed with a different key', () => {
    const wrongKey = createHmac('sha512', 'sk_test_other').update(BODY).digest('hex');
    expect(verifyPaystackSignature(BODY, wrongKey, SECRET)).toBe(false);
  });

  it('rejects a body altered after signing', () => {
    // The whole point: change one digit of the amount and the signature dies.
    const tampered = BODY.replace('123', '124');
    expect(verifyPaystackSignature(tampered, VALID_SIGNATURE, SECRET)).toBe(false);
  });

  it('rejects a missing signature', () => {
    expect(verifyPaystackSignature(BODY, null, SECRET)).toBe(false);
    expect(verifyPaystackSignature(BODY, '', SECRET)).toBe(false);
  });

  it('rejects a signature of the wrong length without throwing', () => {
    // timingSafeEqual throws on length mismatch; that must not become a 500.
    expect(verifyPaystackSignature(BODY, 'abc123', SECRET)).toBe(false);
  });

  it('rejects a non-hex signature without throwing', () => {
    expect(verifyPaystackSignature(BODY, 'z'.repeat(128), SECRET)).toBe(false);
  });

  it('is case-insensitive about hex, as hex encoding is', () => {
    expect(verifyPaystackSignature(BODY, VALID_SIGNATURE.toUpperCase(), SECRET)).toBe(true);
  });

  it('verifies the exact bytes received, not a re-serialised object', () => {
    // JSON.parse then JSON.stringify reorders keys and drops whitespace, which
    // breaks the signature. Verification must run on the raw body.
    const spaced = '{"event": "charge.success", "data": {"id": 123}}';
    const spacedSignature = createHmac('sha512', SECRET).update(spaced).digest('hex');

    expect(verifyPaystackSignature(spaced, spacedSignature, SECRET)).toBe(true);
    expect(verifyPaystackSignature(BODY, spacedSignature, SECRET)).toBe(false);
  });

  it('names the header Paystack actually sends', () => {
    expect(PAYSTACK_SIGNATURE_HEADER).toBe('x-paystack-signature');
  });
});

describe('event parsing', () => {
  it('accepts a well-formed envelope', () => {
    const parsed = parsePaystackEvent('{"event":"charge.success","data":{"id":1}}');
    expect(parsed.event).toBe('charge.success');
  });

  it('rejects malformed JSON', () => {
    expect(() => parsePaystackEvent('not json')).toThrow();
  });

  it('rejects an envelope with no event name', () => {
    expect(() => parsePaystackEvent('{"data":{}}')).toThrow();
  });

  it('rejects an envelope with no data object', () => {
    expect(() => parsePaystackEvent('{"event":"charge.success"}')).toThrow();
  });
});

describe('deduplication key', () => {
  it('is stable across redeliveries of the same event', () => {
    const body = '{"event":"charge.success","data":{"id":9,"reference":"hm_a"}}';
    expect(deriveEventId(parsePaystackEvent(body))).toBe(
      deriveEventId(parsePaystackEvent(body)),
    );
  });

  it('distinguishes different event types on the same transaction', () => {
    // A dispute on a transaction we already recorded as paid is a new event,
    // not a duplicate of the charge.
    const success = parsePaystackEvent('{"event":"charge.success","data":{"id":9}}');
    const dispute = parsePaystackEvent('{"event":"charge.dispute.create","data":{"id":9}}');
    expect(deriveEventId(success)).not.toBe(deriveEventId(dispute));
  });

  it('distinguishes different transactions', () => {
    const first = parsePaystackEvent('{"event":"charge.success","data":{"id":9}}');
    const second = parsePaystackEvent('{"event":"charge.success","data":{"id":10}}');
    expect(deriveEventId(first)).not.toBe(deriveEventId(second));
  });

  it('falls back to the reference when there is no id', () => {
    const parsed = parsePaystackEvent('{"event":"charge.success","data":{"reference":"hm_x"}}');
    expect(deriveEventId(parsed)).toContain('hm_x');
  });

  it('falls back to a body digest when there is neither', () => {
    // Never throw here: an unkeyable event must still be recorded, and a digest
    // at least makes an identical redelivery a duplicate.
    const parsed = parsePaystackEvent('{"event":"transfer.success","data":{"foo":"bar"}}');
    expect(deriveEventId(parsed)).toMatch(/^transfer\.success:sha256:[a-f0-9]{16}/);
  });
});

describe('event classification', () => {
  it('recognises a successful charge', () => {
    expect(classifyEvent('charge.success')).toBe('charge_success');
  });

  it('recognises a failed charge', () => {
    expect(classifyEvent('charge.failed')).toBe('charge_failed');
  });

  it('recognises refunds', () => {
    expect(classifyEvent('refund.processed')).toBe('refund_processed');
    expect(classifyEvent('refund.failed')).toBe('refund_failed');
  });

  it('recognises disputes', () => {
    expect(classifyEvent('charge.dispute.create')).toBe('dispute_opened');
    expect(classifyEvent('charge.dispute.resolve')).toBe('dispute_resolved');
  });

  it('marks an unknown event as ignored rather than guessing', () => {
    expect(classifyEvent('subscription.create')).toBe('ignored');
    expect(classifyEvent('something.brand.new')).toBe('ignored');
  });
});

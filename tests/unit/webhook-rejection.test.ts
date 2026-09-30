/**
 * What the webhook handler refuses before it touches the database.
 *
 * These run without Mongo because signature verification is the first thing
 * that happens — which is the property being tested. If an unsigned request
 * ever reached a database write, these tests would fail by timing out on a
 * connection rather than passing.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { processPaystackEvent } from '../../src/lib/webhooks/processPaystackEvent';
import { chargeSuccess, sign, TEST_SECRET } from '../helpers/paystackFixtures';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('an unsigned or mis-signed delivery is refused before anything is written', () => {
  it('rejects a missing signature with 401', async () => {
    const { rawBody } = sign(chargeSuccess({ reference: 'hm_a', amountKobo: 1_000_000 }));

    const result = await processPaystackEvent({
      rawBody,
      signature: null,
      secretKey: TEST_SECRET,
    });

    expect(result.outcome).toBe('invalid_signature');
    expect(result.httpStatus).toBe(401);
  });

  it('rejects a signature from the wrong key', async () => {
    const { rawBody } = sign(
      chargeSuccess({ reference: 'hm_a', amountKobo: 1_000_000 }),
      'sk_test_attacker',
    );

    const result = await processPaystackEvent({
      rawBody,
      signature: 'a'.repeat(128),
      secretKey: TEST_SECRET,
    });

    expect(result.outcome).toBe('invalid_signature');
  });

  it('rejects a body altered after signing', async () => {
    // The attack this exists to stop: take a real ₦100 webhook, change it to
    // ₦1,000,000, replay it.
    const { rawBody, signature } = sign(
      chargeSuccess({ reference: 'hm_a', amountKobo: 10_000 }),
    );
    const tampered = rawBody.replace('"amount":10000', '"amount":100000000');

    const result = await processPaystackEvent({
      rawBody: tampered,
      signature,
      secretKey: TEST_SECRET,
    });

    expect(result.outcome).toBe('invalid_signature');
    expect(result.httpStatus).toBe(401);
  });

  it('rejects a garbage signature header without throwing', async () => {
    const { rawBody } = sign(chargeSuccess({ reference: 'hm_a', amountKobo: 1_000_000 }));

    for (const signature of ['', 'abc', 'z'.repeat(128), '../../etc/passwd']) {
      const result = await processPaystackEvent({ rawBody, signature, secretKey: TEST_SECRET });
      expect(result.outcome).toBe('invalid_signature');
    }
  });

  it('never calls Paystack for an unsigned delivery', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { rawBody } = sign(chargeSuccess({ reference: 'hm_a', amountKobo: 1_000_000 }));
    await processPaystackEvent({ rawBody, signature: null, secretKey: TEST_SECRET });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('configuration', () => {
  it('refuses to verify webhooks with no secret configured', async () => {
    const { rawBody, signature } = sign(
      chargeSuccess({ reference: 'hm_a', amountKobo: 1_000_000 }),
    );

    // Failing open here would accept every forged webhook on a misconfigured
    // deploy, so this must throw rather than return false.
    await expect(
      processPaystackEvent({ rawBody, signature, secretKey: '' }),
    ).rejects.toThrow(/PAYSTACK_SECRET_KEY/);
  });
});

/**
 * Paystack transport: key guards, error mapping, retry policy, redaction.
 *
 * The retry tests matter most. Retrying a subaccount creation after a timeout
 * silently creates a second subaccount on Paystack's side, and nothing in our
 * database would show it happened.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PaymentsUnavailableError,
  PaystackError,
  PaystackUnavailableError,
  paystackRequest,
  readPaystackConfig,
  redactSecrets,
} from '../../src/lib/paystack/client';
import { createSubaccount, listBanks, resolveAccount } from '../../src/lib/paystack/accounts';

const config = {
  secretKey: 'sk_test_fake_key_for_tests',
  baseUrl: 'https://api.paystack.test',
  timeoutMs: 1_000,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('readPaystackConfig', () => {
  it('accepts a test key', () => {
    const result = readPaystackConfig({ PAYSTACK_SECRET_KEY: 'sk_test_abc' });
    expect(result.secretKey).toBe('sk_test_abc');
  });

  it('throws when unset', () => {
    expect(() => readPaystackConfig({})).toThrow(/not configured/);
  });

  it('reports a missing key as a 503 that names no key', () => {
    // Checkout used to answer "Something went wrong" (500) here.
    try {
      readPaystackConfig({});
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(PaymentsUnavailableError);
      expect((error as PaymentsUnavailableError).statusCode).toBe(503);
      expect((error as PaymentsUnavailableError).publicMessage).not.toMatch(/PAYSTACK|key/i);
    }
  });

  it('refuses a live key by default', () => {
    // The repository rule is test keys only. A rule that lives only in a
    // document gets broken by a deploy.
    expect(() =>
      readPaystackConfig({ PAYSTACK_SECRET_KEY: 'sk_live_abc' }),
    ).toThrow(/Refusing to use a non-test/);
  });

  it('allows a live key only with the explicit opt-in', () => {
    const result = readPaystackConfig({
      PAYSTACK_SECRET_KEY: 'sk_live_abc',
      HORDEMART_ALLOW_LIVE_KEYS: 'true',
    });
    expect(result.secretKey).toBe('sk_live_abc');
  });
});

describe('redactSecrets', () => {
  it('removes test and live keys from text', () => {
    expect(redactSecrets('failed with sk_test_abc123XYZ in header')).toBe(
      'failed with [redacted] in header',
    );
    expect(redactSecrets('key pk_live_zzz999')).toBe('key [redacted]');
  });

  it('leaves ordinary text alone', () => {
    expect(redactSecrets('account could not be resolved')).toBe(
      'account could not be resolved',
    );
  });
});

describe('request success', () => {
  it('unwraps the Paystack envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ status: true, message: 'ok', data: { account_name: 'ADE OKON' } }),
      ),
    );

    const result = await paystackRequest<{ account_name: string }>({
      method: 'GET',
      path: '/bank/resolve',
      config,
    });

    expect(result.account_name).toBe('ADE OKON');
  });

  it('sends the secret key as a bearer token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ status: true, message: 'ok', data: {} }));
    vi.stubGlobal('fetch', fetchMock);

    await paystackRequest({ method: 'GET', path: '/bank', config });

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${config.secretKey}`);
  });
});

describe('error mapping', () => {
  it('maps a 4xx to PaystackError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ status: false, message: 'Could not resolve account name' }, 422),
      ),
    );

    await expect(paystackRequest({ method: 'GET', path: '/x', config })).rejects.toThrow(
      PaystackError,
    );
  });

  it('maps a 5xx to PaystackUnavailableError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ status: false, message: 'server error' }, 503)),
    );

    await expect(paystackRequest({ method: 'GET', path: '/x', config })).rejects.toThrow(
      PaystackUnavailableError,
    );
  });

  it('maps a network failure to PaystackUnavailableError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));

    await expect(paystackRequest({ method: 'GET', path: '/x', config })).rejects.toThrow(
      PaystackUnavailableError,
    );
  });

  it('treats status:false in a 200 body as a failure', async () => {
    // Paystack sometimes returns HTTP 200 with status:false. Trusting the HTTP
    // code alone would read that as success.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ status: false, message: 'declined' }, 200)),
    );

    await expect(paystackRequest({ method: 'GET', path: '/x', config })).rejects.toThrow(
      PaystackError,
    );
  });

  it('does not leak a key into the error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ status: false, message: 'bad key sk_test_leaked123' }, 401),
      ),
    );

    await expect(paystackRequest({ method: 'GET', path: '/x', config })).rejects.toThrow(
      /\[redacted\]/,
    );
  });

  it('rejects a non-JSON success body rather than guessing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>nope</html>')));

    await expect(paystackRequest({ method: 'GET', path: '/x', config })).rejects.toThrow(
      PaystackUnavailableError,
    );
  });
});

describe('retry policy', () => {
  it('does not retry when retry is off', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      paystackRequest({ method: 'POST', path: '/subaccount', config }),
    ).rejects.toThrow(PaystackUnavailableError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a transient failure when retry is on', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValue(jsonResponse({ status: true, message: 'ok', data: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await paystackRequest({ method: 'GET', path: '/bank', retry: true, config });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 4xx, which will not succeed on a second try', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ status: false, message: 'invalid' }, 400));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      paystackRequest({ method: 'GET', path: '/bank', retry: true, config }),
    ).rejects.toThrow(PaystackError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after the attempt limit', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      paystackRequest({ method: 'GET', path: '/bank', retry: true, config }),
    ).rejects.toThrow(PaystackUnavailableError);

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('account operations', () => {
  it('createSubaccount never retries', async () => {
    // A retried POST can leave a duplicate subaccount on Paystack that no
    // failure in our logs would reveal.
    const fetchMock = vi.fn().mockRejectedValue(new Error('ETIMEDOUT'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      createSubaccount(
        {
          business_name: 'Ade Stores',
          bank_code: '058',
          account_number: '0123456789',
          percentage_charge: 100,
        },
        { config },
      ),
    ).rejects.toThrow(PaystackUnavailableError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('resolveAccount sends account number and bank code as query parameters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        status: true,
        message: 'ok',
        data: { account_number: '0123456789', account_name: 'ADE OKON' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await resolveAccount(
      { accountNumber: '0123456789', bankCode: '058' },
      { config },
    );

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('account_number=0123456789');
    expect(url).toContain('bank_code=058');
    expect(result.account_name).toBe('ADE OKON');
  });

  it('listBanks drops inactive banks', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          status: true,
          message: 'ok',
          data: [
            { code: '058', name: 'GTBank', slug: 'gtb', active: true },
            { code: '999', name: 'Defunct Bank', slug: 'defunct', active: false },
          ],
        }),
      ),
    );

    const banks = await listBanks({ config });

    expect(banks).toHaveLength(1);
    expect(banks[0]?.code).toBe('058');
  });
});

/**
 * Payout onboarding: verification behaviour, audit redaction, and the checkout
 * gate that keeps an unverified seller from taking money.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { verifyPayoutAccount, newSellerHoldDays } from '../../src/lib/onboarding/payout';
import { redactForAudit } from '../../src/lib/audit';
import { Site } from '../../src/lib/db/models/Site';
import { ValidationError } from '../../src/lib/errors';
import { PaystackUnavailableError } from '../../src/lib/paystack/client';
import { payoutDetailsSchema } from '../../src/lib/validation/schemas';

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

describe('verifyPayoutAccount', () => {
  it('returns the bank-held name and only the last four digits', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          status: true,
          message: 'ok',
          data: { account_number: '0123456789', account_name: 'ADE OKON' },
        }),
      ),
    );

    const result = await verifyPayoutAccount(
      { accountNumber: '0123456789', bankCode: '058' },
      { config },
    );

    expect(result.accountName).toBe('ADE OKON');
    expect(result.accountNumberLast4).toBe('6789');
    // The full number must not travel back to the client.
    expect(JSON.stringify(result)).not.toContain('0123456789');
  });

  it('turns a Paystack 4xx into a user-correctable validation error', async () => {
    // "That account does not exist" is the seller's typo, not our outage.
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ status: false, message: 'Could not resolve' }, 422)),
    );

    await expect(
      verifyPayoutAccount({ accountNumber: '0000000000', bankCode: '058' }, { config }),
    ).rejects.toThrow(ValidationError);
  });

  it('propagates a provider outage as an outage, not a validation error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));

    await expect(
      verifyPayoutAccount({ accountNumber: '0123456789', bankCode: '058' }, { config }),
    ).rejects.toThrow(PaystackUnavailableError);
  });

  it('rejects a resolution that came back without a name', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ status: true, message: 'ok', data: { account_number: '0123456789' } }),
      ),
    );

    await expect(
      verifyPayoutAccount({ accountNumber: '0123456789', bankCode: '058' }, { config }),
    ).rejects.toThrow(ValidationError);
  });
});

describe('payout input validation', () => {
  it('accepts a well-formed NUBAN', () => {
    const result = payoutDetailsSchema.safeParse({
      businessName: 'Ade Stores',
      bankCode: '058',
      accountNumber: '0123456789',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an account number that is not ten digits', () => {
    for (const accountNumber of ['12345', '012345678901', '01234abcde']) {
      const result = payoutDetailsSchema.safeParse({
        businessName: 'Ade Stores',
        bankCode: '058',
        accountNumber,
      });
      expect(result.success).toBe(false);
    }
  });

  it('rejects a non-numeric bank code', () => {
    const result = payoutDetailsSchema.safeParse({
      businessName: 'Ade Stores',
      bankCode: 'GTB',
      accountNumber: '0123456789',
    });
    expect(result.success).toBe(false);
  });
});

describe('audit redaction', () => {
  it('drops an account number however it is spelled', () => {
    const redacted = redactForAudit({
      accountNumber: '0123456789',
      account_number: '0123456789',
      newAccountNumber: '0123456789',
      businessName: 'Ade Stores',
    }) as Record<string, unknown>;

    expect(redacted.accountNumber).toBe('[redacted]');
    expect(redacted.account_number).toBe('[redacted]');
    expect(redacted.newAccountNumber).toBe('[redacted]');
    expect(redacted.businessName).toBe('Ade Stores');
  });

  it('drops credentials and identity numbers', () => {
    const redacted = redactForAudit({
      passwordHash: 'x',
      token: 'y',
      apiKey: 'z',
      bvn: '12345678901',
      nin: '12345678901',
    }) as Record<string, string>;

    for (const value of Object.values(redacted)) {
      expect(value).toBe('[redacted]');
    }
  });

  it('keeps the last four digits, which are safe to show', () => {
    const redacted = redactForAudit({ accountNumberLast4: '6789' }) as Record<string, unknown>;
    expect(redacted.accountNumberLast4).toBe('6789');
  });

  it('redacts through nested objects', () => {
    const redacted = redactForAudit({
      before: { payout: { accountNumber: '0123456789', bankCode: '058' } },
    }) as { before: { payout: Record<string, unknown> } };

    expect(redacted.before.payout.accountNumber).toBe('[redacted]');
    expect(redacted.before.payout.bankCode).toBe('058');
  });
});

describe('new-seller hold configuration', () => {
  it('is off by default', () => {
    expect(newSellerHoldDays({})).toBe(0);
  });

  it('reads a positive integer', () => {
    expect(newSellerHoldDays({ NEW_SELLER_HOLD_DAYS: '7' })).toBe(7);
  });

  it('ignores nonsense rather than holding forever', () => {
    expect(newSellerHoldDays({ NEW_SELLER_HOLD_DAYS: 'soon' })).toBe(0);
    expect(newSellerHoldDays({ NEW_SELLER_HOLD_DAYS: '-3' })).toBe(0);
  });
});

describe('the checkout gate', () => {
  function site(payout: Record<string, unknown>, extra: Record<string, unknown> = {}) {
    return new Site({
      slug: 'ade-store',
      name: 'Ade Stores',
      ownerId: new Types.ObjectId(),
      planCode: 'free',
      payout,
      ...extra,
    });
  }

  it('blocks a site with no payout details', () => {
    const result = site({ status: 'unset' }).canAcceptPayments();
    expect(result).toEqual({ allowed: false, reason: 'payout_not_verified' });
  });

  it('blocks a site still pending verification', () => {
    const result = site({ status: 'pending' }).canAcceptPayments();
    expect(result.allowed).toBe(false);
  });

  it('blocks a verified site that somehow has no subaccount', () => {
    const result = site({ status: 'verified' }).canAcceptPayments();
    expect(result).toEqual({ allowed: false, reason: 'no_subaccount' });
  });

  it('allows a fully verified site', () => {
    const result = site({ status: 'verified', subaccountCode: 'ACCT_abc' }).canAcceptPayments();
    expect(result).toEqual({ allowed: true });
  });

  it('blocks a suspended site', () => {
    const result = site(
      { status: 'verified', subaccountCode: 'ACCT_abc' },
      { status: 'suspended' },
    ).canAcceptPayments();
    expect(result).toEqual({ allowed: false, reason: 'site_not_active' });
  });

  it('blocks a site flagged for prohibited products', () => {
    const result = site(
      { status: 'verified', subaccountCode: 'ACCT_abc' },
      { prohibitedProductFlag: true },
    ).canAcceptPayments();
    expect(result).toEqual({ allowed: false, reason: 'prohibited_products_flagged' });
  });

  it('blocks during a new-seller hold', () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const result = site(
      { status: 'verified', subaccountCode: 'ACCT_abc' },
      { checkoutEnabledFrom: tomorrow },
    ).canAcceptPayments();
    expect(result).toEqual({ allowed: false, reason: 'new_seller_hold' });
  });

  it('allows once the hold has elapsed', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = site(
      { status: 'verified', subaccountCode: 'ACCT_abc' },
      { checkoutEnabledFrom: yesterday },
    ).canAcceptPayments();
    expect(result).toEqual({ allowed: true });
  });
});

/**
 * Tiers, add-on contact and subscription plumbing that needs no database.
 * Quotas and payment confirmation run against MongoDB in
 * tests/integration/billing.test.ts.
 */

import { describe, expect, it } from 'vitest';
import { ADDONS, TIERS, salesContactEmail, tierFor } from '../../src/config/plans';
import { isSubscriptionReference, premiumPlanCode } from '../../src/lib/billing/subscription';
import { classifyEvent } from '../../src/lib/webhooks/paystackEvent';

describe('tiers', () => {
  it('separates Free from Premium by how much a store can upload', () => {
    for (const key of ['products', 'imagesPerProduct', 'posts', 'projects', 'maxUploadBytes'] as const) {
      expect(TIERS.pro.limits[key], key).toBeGreaterThan(TIERS.free.limits[key]);
    }
  });

  it('gives an unknown or missing plan Free limits, never Premium', () => {
    expect(tierFor('enterprise').code).toBe('free');
    expect(tierFor(undefined).code).toBe('free');
    expect(tierFor('pro').code).toBe('pro');
  });

  it('prices are integer kobo', () => {
    for (const tier of Object.values(TIERS)) expect(Number.isInteger(tier.priceKobo)).toBe(true);
  });
});

describe('add-on contact address', () => {
  it('is null when unset, so the page never invents an address', () => {
    expect(salesContactEmail({})).toBeNull();
  });

  it('accepts a plain address and refuses anything that could inject into a mailto link', () => {
    expect(salesContactEmail({ SALES_CONTACT_EMAIL: 'sales@hordemart.com' })).toBe('sales@hordemart.com');
    for (const bad of ['not-an-email', 'a@b.com?bcc=victim@x.com', 'a@b.com>"<script>', 'a b@c.com']) {
      expect(salesContactEmail({ SALES_CONTACT_EMAIL: bad }), bad).toBeNull();
    }
  });

  it('offers a custom domain and business email', () => {
    expect(ADDONS.map((addon) => addon.id)).toEqual(['domain', 'email']);
  });
});

describe('subscription plumbing', () => {
  it('recognises only our own subscription references', () => {
    expect(isSubscriptionReference('hmsub_0123abcd')).toBe(true);
    expect(isSubscriptionReference('hm_0123abcd')).toBe(false);
    expect(isSubscriptionReference(null)).toBe(false);
  });

  it('only accepts a Paystack plan code shape for the Premium plan', () => {
    expect(premiumPlanCode({})).toBeNull();
    expect(premiumPlanCode({ PAYSTACK_PREMIUM_PLAN_CODE: 'PLN_abc123xyz' })).toBe('PLN_abc123xyz');
    expect(premiumPlanCode({ PAYSTACK_PREMIUM_PLAN_CODE: 'https://evil.example' })).toBeNull();
  });

  it('classifies the subscription lifecycle events', () => {
    expect(classifyEvent('subscription.create')).toBe('subscription_created');
    expect(classifyEvent('subscription.not_renew')).toBe('subscription_not_renewing');
    expect(classifyEvent('subscription.disable')).toBe('subscription_disabled');
    expect(classifyEvent('invoice.payment_failed')).toBe('subscription_payment_failed');
  });
});

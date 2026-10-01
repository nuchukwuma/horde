/**
 * Premium subscriptions, billed through Paystack Subscriptions.
 *
 * This is HordeMart's own revenue — a seller paying us — so it settles to the
 * platform's Paystack balance with no subaccount and no split. It does not
 * touch a seller's sales money in any way (CLAUDE.md rule 6 is unaffected).
 *
 * Flow:
 *   1. startPremiumCheckout — initialise a Paystack transaction against the
 *      plan named by PAYSTACK_PREMIUM_PLAN_CODE, with OUR reference
 *      (hmsub_…), and remember that reference on the site.
 *   2. confirmPremiumPayment — on the charge.success webhook (or the seller's
 *      return to the billing page), ask Paystack's verify endpoint what
 *      happened. Only a successful NGN charge of at least the configured price,
 *      for a reference we issued to THIS site, upgrades the site.
 *   3. subscription.create links Paystack's subscription to the site;
 *      subscription.not_renew marks it ending; subscription.disable and an
 *      expired period drop the site back to Free.
 *
 * Downgrading never deletes or hides content; the store just cannot add more
 * until it is under Free's limits.
 */

import { randomBytes } from 'node:crypto';
import type { Types } from 'mongoose';
import { Site, type SiteDocument } from '../db/models/Site';
import { User } from '../db/models/User';
import { paystackRequest } from '../paystack/client';
import { verifyTransaction } from '../paystack/transactions';
import type { PaystackCallOptions } from '../paystack/accounts';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { runWithoutTenantScope } from '../tenant/context';
import { recordAudit } from '../audit';
import { TIERS } from '../../config/plans';

export const SUBSCRIPTION_REFERENCE_PREFIX = 'hmsub_';

export function isSubscriptionReference(reference: string | null | undefined): boolean {
  return typeof reference === 'string' && reference.startsWith(SUBSCRIPTION_REFERENCE_PREFIX);
}

/** The Paystack plan to subscribe to, or null when billing is not set up. */
export function premiumPlanCode(env: Record<string, string | undefined> = process.env): string | null {
  const code = env.PAYSTACK_PREMIUM_PLAN_CODE?.trim();
  return code && /^PLN_[A-Za-z0-9]{6,40}$/.test(code) ? code : null;
}

function updateSite(siteId: Types.ObjectId | string, update: Record<string, unknown>, reason: string) {
  return runWithoutTenantScope(reason, () => Site.updateOne({ _id: siteId }, update));
}

export async function startPremiumCheckout(
  site: SiteDocument,
  ownerUserId: Types.ObjectId,
  callbackUrl: string,
  options: PaystackCallOptions = {},
): Promise<{ authorizationUrl: string; reference: string }> {
  const plan = premiumPlanCode();
  if (!plan) throw new ValidationError('Premium is not available to buy yet.');
  if (site.planCode === 'pro' && site.subscription?.status === 'active') {
    throw new ConflictError('This store is already on Premium.');
  }

  const owner = await User.findById(ownerUserId).select('email');
  if (!owner) throw new NotFoundError('User');

  const reference = `${SUBSCRIPTION_REFERENCE_PREFIX}${randomBytes(16).toString('hex')}`;

  // Bind the reference to the site BEFORE sending anyone to pay. The webhook
  // finds the site by this stored reference, never by metadata alone.
  await updateSite(
    site._id,
    { $set: { 'subscription.pendingReference': reference, 'subscription.status': site.subscription?.status === 'active' ? 'active' : 'pending' } },
    'binding a Premium checkout reference to its Site, which is the tenant root',
  );

  const initialized = await paystackRequest<{ authorization_url: string; reference: string }>({
    method: 'POST',
    path: '/transaction/initialize',
    body: {
      email: owner.email,
      // Paystack charges the plan's amount; this must equal it.
      amount: TIERS.pro.priceKobo,
      currency: 'NGN',
      plan,
      reference,
      callback_url: callbackUrl,
      metadata: { purpose: 'premium_subscription', siteId: String(site._id) },
    },
    retry: false,
    config: options.config,
  });

  return { authorizationUrl: initialized.authorization_url, reference };
}

export type SubscriptionOutcome = 'upgraded' | 'already_active' | 'not_paid' | 'unknown_reference' | 'amount_mismatch';

/**
 * Upgrade the site that owns `reference`, if Paystack confirms the payment.
 * Safe to call more than once (webhook and return page both do).
 */
export async function confirmPremiumPayment(
  reference: string,
  options: PaystackCallOptions = {},
): Promise<SubscriptionOutcome> {
  if (!isSubscriptionReference(reference)) return 'unknown_reference';

  const site = await runWithoutTenantScope('resolving a subscription reference to its Site', () =>
    Site.findOne({ 'subscription.pendingReference': reference }),
  );
  if (!site) return 'unknown_reference';
  if (site.planCode === 'pro' && site.subscription?.status === 'active') return 'already_active';

  const verified = (await verifyTransaction(reference, options)) as Awaited<ReturnType<typeof verifyTransaction>> & {
    customer?: { email?: string; customer_code?: string };
    plan?: string | { plan_code?: string } | null;
  };
  if (verified.status !== 'success') return 'not_paid';

  if (verified.currency !== 'NGN' || verified.amount < TIERS.pro.priceKobo) {
    await recordAudit({
      action: 'webhook.amount_mismatch',
      siteId: site._id,
      targetType: 'Site',
      targetId: String(site._id),
      before: { expectedKobo: TIERS.pro.priceKobo, purpose: 'premium_subscription' },
      after: { paystackAmountKobo: verified.amount, paystackCurrency: verified.currency, reference },
    });
    return 'amount_mismatch';
  }

  const planCode = typeof verified.plan === 'string' ? verified.plan : (verified.plan?.plan_code ?? premiumPlanCode());
  const now = new Date();

  // Guarded on the reference so two concurrent confirmations upgrade once.
  const updated = await runWithoutTenantScope('upgrading a Site to Premium after a verified payment', () =>
    Site.updateOne(
      { _id: site._id, 'subscription.pendingReference': reference, planCode: { $ne: 'pro' } },
      {
        $set: {
          planCode: 'pro',
          'subscription.status': 'active',
          'subscription.paystackCustomerCode': verified.customer?.customer_code ?? null,
          'subscription.paystackPlanCode': planCode,
          'subscription.startedAt': now,
          'subscription.currentPeriodEnd': new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000),
          'subscription.cancelledAt': null,
        },
      },
    ),
  );
  if (updated.modifiedCount === 0) return 'already_active';

  await recordAudit({
    action: 'plan.changed',
    siteId: site._id,
    targetType: 'Site',
    targetId: String(site._id),
    before: { planCode: site.planCode },
    after: { planCode: 'pro', reference },
  });
  return 'upgraded';
}

/** subscription.create: remember Paystack's subscription code and period. */
export async function handleSubscriptionCreated(data: Record<string, unknown>): Promise<'processed' | 'ignored'> {
  const code = typeof data.subscription_code === 'string' ? data.subscription_code : null;
  const customer = (data.customer ?? {}) as { customer_code?: string };
  if (!code || !customer.customer_code) return 'ignored';

  const next = typeof data.next_payment_date === 'string' ? new Date(data.next_payment_date) : null;

  // Matched by the customer code we stored when WE verified the first
  // payment — not by any site id the payload might carry.
  const updated = await runWithoutTenantScope('linking a Paystack subscription to its Site', () =>
    Site.updateOne(
      { 'subscription.paystackCustomerCode': customer.customer_code, planCode: 'pro' },
      {
        $set: {
          'subscription.paystackSubscriptionCode': code,
          ...(next && !Number.isNaN(next.getTime()) ? { 'subscription.currentPeriodEnd': next } : {}),
        },
      },
    ),
  );
  return updated.matchedCount > 0 ? 'processed' : 'ignored';
}

/** subscription.not_renew / subscription.disable / invoice.payment_failed. */
export async function handleSubscriptionChange(
  kind: 'not_renewing' | 'disabled' | 'payment_failed',
  data: Record<string, unknown>,
): Promise<'processed' | 'ignored'> {
  const subscription = (data.subscription ?? data) as { subscription_code?: string };
  const code = subscription.subscription_code;
  if (!code) return 'ignored';

  const update =
    kind === 'disabled'
      ? { $set: { planCode: 'free', 'subscription.status': 'cancelled', 'subscription.cancelledAt': new Date() } }
      : kind === 'not_renewing'
        ? { $set: { 'subscription.status': 'non_renewing' } }
        : { $set: { 'subscription.status': 'attention' } };

  const updated = await runWithoutTenantScope('applying a Paystack subscription change to its Site', () =>
    Site.updateOne({ 'subscription.paystackSubscriptionCode': code }, update),
  );
  return updated.matchedCount > 0 ? 'processed' : 'ignored';
}

/**
 * Stop renewing. Paystack needs the subscription's email token, fetched
 * fresh rather than stored, to disable it. The store stays Premium until
 * Paystack sends subscription.disable at the end of the paid period.
 */
export async function cancelPremium(site: SiteDocument, options: PaystackCallOptions = {}): Promise<void> {
  const code = site.subscription?.paystackSubscriptionCode;
  if (!code) throw new ConflictError('There is no active Premium subscription to cancel.');

  const details = await paystackRequest<{ email_token?: string }>({
    method: 'GET',
    path: `/subscription/${encodeURIComponent(code)}`,
    retry: true,
    config: options.config,
  });
  if (!details.email_token) throw new ConflictError('Paystack did not return a token to cancel with.');

  await paystackRequest({
    method: 'POST',
    path: '/subscription/disable',
    body: { code, token: details.email_token },
    retry: false,
    config: options.config,
  });

  await updateSite(site._id, { $set: { 'subscription.status': 'non_renewing' } }, 'marking a cancelled Premium subscription on its Site');
}

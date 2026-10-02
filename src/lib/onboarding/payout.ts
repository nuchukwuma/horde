/**
 * Seller payout onboarding.
 *
 * Two steps, mirroring how a Nigerian bank transfer works: you see the account
 * name before you commit. Step one resolves the account and shows the seller
 * whose name came back; step two creates the subaccount.
 *
 * The account number is held in memory for the length of one request and never
 * written anywhere. Only the last four digits, the resolved name, and the
 * Paystack subaccount code are persisted.
 */

import type { Types } from 'mongoose';
import { Site, type SiteAttributes } from '../db/models/Site';
import { User } from '../db/models/User';
import { assertEmailVerified } from '../auth/emailVerification';
import { createSubaccount, resolveAccount } from '../paystack/accounts';
import type { PaystackCallOptions } from '../paystack/accounts';
import { PaystackError } from '../paystack/client';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { recordAudit } from '../audit';
import { runWithoutTenantScope } from '../tenant/context';
import { assertEmailConfigured, sendEmail } from '../email/transport';

/**
 * How long a newly verified seller must wait before they can take payments.
 *
 * Gates transacting, never settlement — see ADR-0007. Zero disables the hold.
 */
export function newSellerHoldDays(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = Number(env.NEW_SELLER_HOLD_DAYS ?? 0);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
}

export interface VerifyPayoutInput {
  accountNumber: string;
  bankCode: string;
}

export interface VerifiedAccount {
  accountName: string;
  accountNumberLast4: string;
  bankCode: string;
}

/**
 * Step one: ask Paystack who owns this account.
 *
 * Persists nothing. The seller confirms the name before we go further, and a
 * wrong digit is caught here rather than after money has moved.
 */
export async function verifyPayoutAccount(
  input: VerifyPayoutInput,
  options: PaystackCallOptions = {},
): Promise<VerifiedAccount> {
  let resolved;
  try {
    resolved = await resolveAccount(
      { accountNumber: input.accountNumber, bankCode: input.bankCode },
      options,
    );
  } catch (error) {
    // Paystack answers "could not resolve" with a 4xx. That is a user-correctable
    // mistake, not a provider failure, so it must not surface as a 502.
    if (error instanceof PaystackError && error.statusCode < 500) {
      throw new ValidationError(
        'Could not verify that account. Check the account number and bank, then try again.',
      );
    }
    throw error;
  }

  if (!resolved.account_name) {
    throw new ValidationError('The bank did not return an account name for that number.');
  }

  return {
    accountName: resolved.account_name,
    accountNumberLast4: input.accountNumber.slice(-4),
    bankCode: input.bankCode,
  };
}

export interface SavePayoutInput {
  siteId: Types.ObjectId | string;
  businessName: string;
  bankCode: string;
  accountNumber: string;
  actorUserId: Types.ObjectId;
  actorRole: string;
  ip?: string;
  userAgent?: string;
}

export interface SavePayoutResult {
  subaccountCode: string;
  accountName: string;
  accountNumberLast4: string;
  checkoutEnabledFrom: Date | null;
}

/**
 * Step two: verify again, create the subaccount, persist, audit.
 *
 * The account is re-resolved rather than trusting that step one happened or
 * that the client reported its result honestly. The client is not a source of
 * truth about seller identity.
 */
export async function savePayoutDetails(
  input: SavePayoutInput,
  options: PaystackCallOptions = {},
): Promise<SavePayoutResult> {
  // The email gate lives here rather than only in the route handler, so a new
  // caller — an admin tool, a script, a second endpoint — cannot reach the
  // step that attaches a bank account without passing it. See
  // auth/emailVerification.ts for why the gate is here and not on login.
  const actor = await User.findById(input.actorUserId).select('emailVerifiedAt email name');
  if (!actor) throw new NotFoundError('User');
  assertEmailVerified(actor);

  const site = await loadSiteForPayout(input.siteId);

  // Re-resolve. This is the KYC check, and it is cheap relative to sending
  // money to the wrong person.
  const verified = await verifyPayoutAccount(
    { accountNumber: input.accountNumber, bankCode: input.bankCode },
    options,
  );

  const subaccount = await createSubaccount(
    {
      business_name: input.businessName,
      bank_code: input.bankCode,
      account_number: input.accountNumber,
      // Not used for per-order splits; see types.ts. 100 fails safe toward the
      // seller if a transaction ever arrives without an explicit charge.
      percentage_charge: 100,
    },
    options,
  );

  if (!subaccount.subaccount_code) {
    throw new ConflictError('Paystack did not return a subaccount code');
  }

  const before = auditSnapshot(site);
  const holdDays = newSellerHoldDays();

  // Only set the hold the first time payout details are verified. Changing bank
  // details later should not silently re-freeze an established seller.
  const checkoutEnabledFrom =
    site.payout.status === 'verified'
      ? (site.checkoutEnabledFrom ?? null)
      : holdDays > 0
        ? new Date(Date.now() + holdDays * 24 * 60 * 60 * 1000)
        : null;

  const updated = await runWithoutTenantScope(
    'updating a Site, which is the tenant root and therefore not tenant-scoped',
    () =>
      Site.findByIdAndUpdate(
        site._id,
        {
          $set: {
            'payout.businessName': input.businessName,
            'payout.bankCode': input.bankCode,
            'payout.accountNumberLast4': verified.accountNumberLast4,
            'payout.resolvedAccountName': verified.accountName,
            'payout.subaccountCode': subaccount.subaccount_code,
            'payout.status': 'verified',
            'payout.verifiedAt': new Date(),
            'payout.lastChangedAt': new Date(),
            'payout.lastChangedBy': input.actorUserId,
            checkoutEnabledFrom,
          },
        },
        { new: true },
      ),
  );

  if (!updated) throw new NotFoundError('Site');

  await recordAudit({
    action: 'payout.details.changed',
    siteId: site._id,
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    targetType: 'Site',
    targetId: String(site._id),
    before,
    // The resolved account name is recorded alongside the seller-supplied
    // business name so an admin reviewing fraud can see whether they matched.
    // They legitimately differ (a trading name versus a personal account), so
    // this is evidence for a human, not an automatic rejection.
    after: auditSnapshot(updated),
    ip: input.ip,
    userAgent: input.userAgent,
  });

  // Tell the owner, by email, every time. If someone else got into the
  // account and redirected the payouts, this is how the seller finds out
  // before the next settlement rather than after it. Best effort: the change
  // has already happened at Paystack, so a failed email must not report the
  // change itself as failed.
  try {
    // Never the log transport in production: it would print the account
    // name into the server log.
    assertEmailConfigured();
    await sendEmail({
      to: actor.email,
      subject: `Your payout bank account was changed — ${site.name}`,
      text: [
        `Hi ${actor.name},`,
        '',
        `The bank account that receives payments for ${site.name} was just set to:`,
        '',
        `  ${verified.accountName}, account ending ${verified.accountNumberLast4}`,
        '',
        'If this was you, there is nothing to do.',
        '',
        'If it was NOT you, change your HordeMart password now, put your own bank details back under Payouts in your dashboard, and contact HordeMart support straight away.',
      ].join('\n'),
    });
  } catch {
    console.error('[payout] change notification email could not be sent', String(site._id));
  }

  return {
    subaccountCode: subaccount.subaccount_code,
    accountName: verified.accountName,
    accountNumberLast4: verified.accountNumberLast4,
    checkoutEnabledFrom,
  };
}

async function loadSiteForPayout(siteId: Types.ObjectId | string): Promise<SiteAttributes> {
  const site = await runWithoutTenantScope(
    'loading a Site by id, which is the tenant root and therefore not tenant-scoped',
    () => Site.findById(siteId),
  );

  if (!site) throw new NotFoundError('Site');
  if (site.status === 'closed') {
    throw new ConflictError('This site is closed and cannot accept payout details');
  }

  return site;
}

/** Fields worth keeping in the audit trail. Never the account number. */
function auditSnapshot(site: SiteAttributes): Record<string, unknown> {
  return {
    businessName: site.payout.businessName ?? null,
    bankCode: site.payout.bankCode ?? null,
    accountNumberLast4: site.payout.accountNumberLast4 ?? null,
    resolvedAccountName: site.payout.resolvedAccountName ?? null,
    subaccountCode: site.payout.subaccountCode ?? null,
    status: site.payout.status,
  };
}

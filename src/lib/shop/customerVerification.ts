/**
 * Email confirmation for shoppers.
 *
 * It gates nothing. Guest checkout needs no account at all, so blocking an
 * account holder until they click a link would make an account worse than
 * none. What confirmation buys: the store knows the receipts and chat replies
 * reach a real inbox, and the seller can see which accounts are confirmed.
 *
 * Everything runs inside the store's tenant scope. The link is built from the
 * store's own stored address (siteOrigin), never from the request's Host, and
 * the token can only be redeemed on that store: on any other host the lookup
 * is scoped to a different siteId and finds nothing.
 */

import type { Types } from 'mongoose';
import { Customer, type CustomerAttributes } from '../db/models/Customer';
import { CustomerVerificationToken } from '../db/models/CustomerVerificationToken';
import { runWithTenant } from '../tenant/context';
import { assertEmailConfigured, sendEmail, type SendResult } from '../email/transport';
import { customerVerifyEmail } from '../email/templates';
import { generateVerificationToken, hashVerificationToken, VERIFICATION_TTL_MS } from '../auth/emailVerification';
import { siteOrigin } from '../seo/meta';
import { ValidationError } from '../errors';

interface StoreIdentity {
  _id: Types.ObjectId;
  slug: string;
  name: string;
  customDomain?: string | null;
}

export async function issueCustomerVerification(input: {
  site: StoreIdentity;
  customer: Pick<CustomerAttributes, '_id' | 'email' | 'name'>;
}): Promise<{ token: string; delivery: SendResult }> {
  assertEmailConfigured();

  const token = generateVerificationToken();
  const tenant = { siteId: String(input.site._id), slug: input.site.slug };

  await runWithTenant(tenant, async () => {
    // One live link at a time.
    await CustomerVerificationToken.updateMany(
      { customerId: input.customer._id, consumedAt: null },
      { $set: { consumedAt: new Date() } },
    );
    await CustomerVerificationToken.create({
      customerId: input.customer._id,
      tokenHash: hashVerificationToken(token),
      email: input.customer.email,
      expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
    });
  });

  const link = `${siteOrigin(input.site)}/account/verify?token=${encodeURIComponent(token)}`;
  const delivery = await sendEmail({
    to: input.customer.email,
    fromName: input.site.name,
    ...customerVerifyEmail({ name: input.customer.name, storeName: input.site.name, link }),
  });

  return { token, delivery };
}

/** Same single message for every failure, as for sellers (auth/emailVerification.ts). */
export async function consumeCustomerVerification(
  siteId: Types.ObjectId | string,
  token: string,
): Promise<CustomerAttributes> {
  const invalid = new ValidationError('That confirmation link is not valid. Sign in to get a new one.');
  if (!token) throw invalid;

  return runWithTenant({ siteId: String(siteId) }, async () => {
    // Consumed atomically first: two clicks race to one winner.
    const record = await CustomerVerificationToken.findOneAndUpdate(
      { tokenHash: hashVerificationToken(token), consumedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { consumedAt: new Date() } },
    );
    if (!record) throw invalid;

    const customer = await Customer.findById(record.customerId);
    // The address changed after the link went out.
    if (!customer || customer.email !== record.email || customer.status !== 'active') throw invalid;

    const updated = await Customer.findOneAndUpdate(
      { _id: customer._id },
      { $set: { emailVerifiedAt: customer.emailVerifiedAt ?? new Date() } },
      { new: true },
    );
    if (!updated) throw invalid;
    return updated;
  });
}

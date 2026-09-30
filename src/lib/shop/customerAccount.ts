/**
 * Shopper accounts on a single storefront.
 *
 * Every function here takes the siteId from the resolved host, never from the
 * request body. A shopper registering on ade-store cannot create or read an
 * account on another store by naming it.
 *
 * An account is always optional. Guest checkout stays the default path, and
 * nothing in the store module requires a Customer to exist — see
 * checkout/createCheckout.ts, where customerId is nullable.
 */

import type { Types } from 'mongoose';
import { Customer, type CustomerAttributes } from '../db/models/Customer';
import { fakeVerifyPassword, hashPassword, verifyPassword } from '../auth/password';
import { AuthenticationError, ConflictError } from '../errors';
import { runWithTenant } from '../tenant/context';

export interface RegisterCustomerInput {
  siteId: Types.ObjectId;
  email: string;
  password: string;
  name: string;
  phone?: string;
}

export async function registerCustomer(
  input: RegisterCustomerInput,
): Promise<CustomerAttributes> {
  const tenant = { siteId: String(input.siteId) };

  const existing = await runWithTenant(tenant, () =>
    Customer.findOne({ email: input.email }).select('_id'),
  );

  if (existing) {
    // Same reasoning as seller signup: a registration form cannot hide this
    // and stay usable. The disclosure is scoped to one storefront — it says
    // "this address shops here", not "this address exists on HordeMart" —
    // and the rate limit blocks bulk probing.
    throw new ConflictError('You already have an account here. Try signing in.');
  }

  const passwordHash = await hashPassword(input.password);

  // siteId is stamped by tenantScopePlugin from the ambient scope, not passed
  // in the document. Passing it explicitly would work today and silently stop
  // matching the scope the day someone edits one and not the other.
  const customer = await runWithTenant(tenant, () =>
    Customer.create({
      email: input.email,
      passwordHash,
      name: input.name,
      phone: input.phone,
      status: 'active',
      emailVerifiedAt: null,
    }),
  );

  return customer;
}

export interface AuthenticateCustomerInput {
  siteId: Types.ObjectId;
  email: string;
  password: string;
}

/**
 * Sign in a shopper.
 *
 * Vague on purpose, exactly like the seller login: an unknown address and a
 * wrong password produce the same error, and an unknown address still spends
 * the cost of a hash comparison so response timing does not separate them.
 */
export async function authenticateCustomer(
  input: AuthenticateCustomerInput,
): Promise<CustomerAttributes> {
  const tenant = { siteId: String(input.siteId) };

  const customer = await runWithTenant(tenant, () =>
    Customer.findOne({ email: input.email }).select('+passwordHash'),
  );

  if (!customer) {
    await fakeVerifyPassword();
    throw new AuthenticationError('Invalid email or password');
  }

  const valid = await verifyPassword(customer.passwordHash ?? '', input.password);

  if (!valid || customer.status !== 'active') {
    throw new AuthenticationError('Invalid email or password');
  }

  await runWithTenant(tenant, () =>
    Customer.updateOne({ _id: customer._id }, { $set: { lastLoginAt: new Date() } }),
  );

  return customer;
}

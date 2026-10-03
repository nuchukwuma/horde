/**
 * POST /api/shop/account/verify-email/resend — a fresh confirmation link to
 * the signed-in shopper's own address. No address in the body: this must not
 * become a way to make a store email anyone.
 */

import type { NextRequest } from 'next/server';
import { ensureDatabase, requirePublicSite } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { validateCustomerSessionToken } from '@/lib/auth/session';
import { sessionCookieName } from '@/lib/auth/cookies';
import { issueCustomerVerification } from '@/lib/shop/customerVerification';
import { enforceRateLimit } from '@/lib/ratelimit';
import { AuthenticationError, ConflictError } from '@/lib/errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    await ensureDatabase();
    const site = await requirePublicSite(request);
    const session = await validateCustomerSessionToken(
      request.cookies.get(sessionCookieName('storefront'))?.value,
      site._id,
    );
    if (!session) throw new AuthenticationError('Sign in to confirm your email');

    // Keyed to the account: the cost is mail to one inbox.
    await enforceRateLimit('shop:verify-email', `resend:${String(session.customer._id)}`);

    if (session.customer.emailVerifiedAt) throw new ConflictError('That address is already confirmed.');

    const { delivery } = await issueCustomerVerification({ site, customer: session.customer });
    return ok({ sent: true, transport: delivery.transport });
  } catch (error) {
    return toErrorResponse(error);
  }
}

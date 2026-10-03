/**
 * POST /api/shop/account/signup
 *
 * Creates a shopper account on ONE storefront and signs them in there.
 *
 * The store comes from `requirePublicSite`, which reads the slug header that
 * middleware sets from the Host and strips any client-supplied copy of. There
 * is no siteId in the request body, so a shopper cannot register against a
 * store other than the one they are looking at.
 *
 * An account is never required to buy. This exists so a returning customer can
 * see their orders and check out without retyping their details.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { ensureDatabase, requirePublicSite, requestIp, requestUserAgent } from '@/lib/http/context';
import { toErrorResponse } from '@/lib/http/respond';
import { registerCustomer } from '@/lib/shop/customerAccount';
import { issueCustomerVerification } from '@/lib/shop/customerVerification';
import { createCustomerSession } from '@/lib/auth/session';
import { sessionCookieName, sessionCookieOptions } from '@/lib/auth/cookies';
import { customerSignUpSchema } from '@/lib/validation/schemas';
import { clientIdentifier, enforceRateLimit } from '@/lib/ratelimit';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    await ensureDatabase();

    const site = await requirePublicSite(request);

    // Keyed per store as well as per client: one busy storefront must not
    // exhaust the budget for every other seller's shoppers.
    await enforceRateLimit('shop:signup', `${site.slug}:${clientIdentifier(request)}`);

    const body = customerSignUpSchema.parse(await request.json());

    const customer = await registerCustomer({ siteId: site._id, ...body });

    const { token } = await createCustomerSession({
      customerId: customer._id,
      siteId: site._id,
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
    });

    // Best effort: the account exists and the shopper is signed in whether or
    // not the email goes, and they can ask for it again from their account.
    let verificationSent = false;
    try {
      const { delivery } = await issueCustomerVerification({ site, customer });
      verificationSent = delivery.transport === 'resend';
    } catch {
      console.error('[shop] customer confirmation email not sent', String(site._id));
    }

    const response = NextResponse.json(
      { data: { name: customer.name, email: customer.email, verificationSent } },
      { status: 201 },
    );

    response.cookies.set(
      sessionCookieName('storefront'),
      token,
      sessionCookieOptions('storefront'),
    );

    return response;
  } catch (error) {
    return toErrorResponse(error);
  }
}

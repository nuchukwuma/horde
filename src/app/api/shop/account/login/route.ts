/**
 * POST /api/shop/account/login
 *
 * Signs a shopper in on the storefront they are visiting. Same vagueness as
 * the seller login: a wrong password and an unknown address are indistinguishable.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { ensureDatabase, requirePublicSite, requestIp, requestUserAgent } from '@/lib/http/context';
import { toErrorResponse } from '@/lib/http/respond';
import { authenticateCustomer } from '@/lib/shop/customerAccount';
import { createCustomerSession } from '@/lib/auth/session';
import { sessionCookieName, sessionCookieOptions } from '@/lib/auth/cookies';
import { customerSignInSchema } from '@/lib/validation/schemas';
import { clientIdentifier, enforceRateLimit } from '@/lib/ratelimit';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    await ensureDatabase();

    const site = await requirePublicSite(request);
    await enforceRateLimit('shop:login', `${site.slug}:${clientIdentifier(request)}`);

    const { email, password } = customerSignInSchema.parse(await request.json());

    const customer = await authenticateCustomer({ siteId: site._id, email, password });

    const { token } = await createCustomerSession({
      customerId: customer._id,
      siteId: site._id,
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
    });

    const response = NextResponse.json({
      data: { name: customer.name, email: customer.email },
    });

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

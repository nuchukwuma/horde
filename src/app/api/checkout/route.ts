/**
 * POST /api/checkout
 *
 * Called from a seller's storefront. The tenant comes from the host header via
 * middleware, never from the request body — a customer on one store cannot
 * check out against another.
 */

import type { NextRequest } from 'next/server';
import { ensureDatabase } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { clientIdentifier, enforceRateLimit } from '@/lib/ratelimit';
import { createCheckout } from '@/lib/checkout/createCheckout';
import { checkoutSchema } from '@/lib/validation/schemas';
import { findSiteBySlug, TENANT_SLUG_HEADER } from '@/lib/tenant/loadSite';
import { validateCustomerSessionToken } from '@/lib/auth/session';
import { sessionCookieName } from '@/lib/auth/cookies';
import { NotFoundError } from '@/lib/errors';
import { siteOrigin } from '@/lib/seo/meta';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    await ensureDatabase();

    // Middleware strips any client-supplied copy of this header before setting
    // it from the Host, so it cannot be forged.
    const slug = request.headers.get(TENANT_SLUG_HEADER);
    if (!slug) {
      throw new NotFoundError('Store');
    }

    const site = await findSiteBySlug(slug);
    if (!site) throw new NotFoundError('Store');

    await enforceRateLimit('checkout:initialize', `${slug}:${clientIdentifier(request)}`);

    const body = checkoutSchema.parse(await request.json());

    // Optional by design. A guest checkout is the normal path; a session only
    // adds the link back to an account. The session is validated against THIS
    // site, so a cookie from another storefront resolves to nothing rather
    // than attaching someone else's customer to this order.
    const shopper = await validateCustomerSessionToken(
      request.cookies.get(sessionCookieName('storefront'))?.value,
      site._id,
    );

    const result = await createCheckout({
      site,
      items: body.items,
      // A signed-in shopper's address comes from their account, not the body:
      // otherwise an order could be filed under one account and receipted to
      // a different address.
      customerEmail: shopper?.customer.email ?? body.customerEmail,
      customerName: shopper?.customer.name ?? body.customerName,
      customerId: shopper?.customer._id ?? null,
      customerPhone: body.customerPhone,
      delivery: body.delivery,
      // Back to THIS store's receipt page. It used to be one global
      // CHECKOUT_CALLBACK_URL, which cannot be right for more than one store:
      // every shopper would land on the same address whichever shop they paid.
      // Built from the stored site, never from the request, so it cannot be
      // pointed anywhere else. Paystack appends ?reference=… itself.
      callbackUrl: `${siteOrigin(site)}/checkout/complete`,
    });

    return ok(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}

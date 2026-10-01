/**
 * POST /api/shop/cart/quote — price a cart from the database.
 *
 * The store comes from the Host via middleware, never the body; a cart on one
 * storefront can only ever be priced against that store's products.
 */

import type { NextRequest } from 'next/server';
import { requirePublicSite } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { clientIdentifier, enforceRateLimit } from '@/lib/ratelimit';
import { withSite } from '@/lib/tenant/loadSite';
import { quoteCart } from '@/lib/checkout/quote';
import { cartQuoteSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const site = await requirePublicSite(request);
    await enforceRateLimit('checkout:quote', `${site.slug}:${clientIdentifier(request)}`);

    const body = cartQuoteSchema.parse(await request.json());
    const quote = await withSite(site, () => quoteCart(site, body.items));

    return ok(quote, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

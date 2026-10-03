/**
 * POST /api/shop/account/verify-email { token } — a shopper confirming their
 * address, from the /account/verify page on the store's own host.
 *
 * POST, not GET, for the same reason as the seller flow: link scanners follow
 * GETs and would spend the token before the shopper clicked. The store comes
 * from the host (requirePublicSite), so a link only works on the store that
 * sent it.
 */

import type { NextRequest } from 'next/server';
import { ensureDatabase, requirePublicSite } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { consumeCustomerVerification } from '@/lib/shop/customerVerification';
import { clientIdentifier, enforceRateLimit } from '@/lib/ratelimit';
import { verifyEmailSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    await ensureDatabase();
    const site = await requirePublicSite(request);
    await enforceRateLimit('shop:verify-email', `${site.slug}:${clientIdentifier(request)}`);

    const { token } = verifyEmailSchema.parse(await request.json());
    const customer = await consumeCustomerVerification(site._id, token);
    return ok({ email: customer.email });
  } catch (error) {
    return toErrorResponse(error);
  }
}

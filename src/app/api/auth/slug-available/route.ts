/**
 * GET /api/auth/slug-available?slug=ade-store
 *
 * Tells the signup form whether a subdomain can be claimed, before the seller
 * fills in the rest and loses it to a validation error.
 *
 * This discloses which stores exist. That is not a leak: a store slug IS a
 * public hostname, resolvable by anyone with DNS. The rate limit here is about
 * cost, not secrecy.
 */

import type { NextRequest } from 'next/server';
import { ensureDatabase } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { clientIdentifier, enforceRateLimit } from '@/lib/ratelimit';
import { isSlugAvailable } from '@/lib/onboarding/signup';
import { slugSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    await ensureDatabase();
    await enforceRateLimit('auth:slug-check', clientIdentifier(request));

    const raw = request.nextUrl.searchParams.get('slug') ?? '';
    const parsed = slugSchema.safeParse(raw);

    if (!parsed.success) {
      // A reserved or malformed slug is answered, not thrown: the form wants
      // to show the reason inline while the seller is still typing.
      return ok({
        slug: raw,
        available: false,
        reason: parsed.error.issues[0]?.message ?? 'That address cannot be used',
      });
    }

    const available = await isSlugAvailable(parsed.data);

    return ok({
      slug: parsed.data,
      available,
      reason: available ? null : 'That address is already taken',
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

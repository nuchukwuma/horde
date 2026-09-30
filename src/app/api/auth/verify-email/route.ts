/**
 * POST /api/auth/verify-email — consume a verification link.
 *
 * POST rather than GET even though the link arrives in an email, because a GET
 * would be followed by mail-client link prefetchers and corporate scanners,
 * consuming the single-use token before the person ever clicks. The emailed
 * link points at a page; the page posts here.
 */

import type { NextRequest } from 'next/server';
import { ensureDatabase } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { consumeEmailVerification } from '@/lib/auth/emailVerification';
import { clientIdentifier, enforceRateLimit } from '@/lib/ratelimit';
import { verifyEmailSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    await ensureDatabase();
    // Tokens are 256 bits, so guessing is not the threat. The limit is here to
    // stop the endpoint being used as a free hash-and-lookup oracle.
    await enforceRateLimit('auth:verify-email', clientIdentifier(request));

    const { token } = verifyEmailSchema.parse(await request.json());
    const user = await consumeEmailVerification(token);

    return ok({ email: user.email, verifiedAt: user.emailVerifiedAt });
  } catch (error) {
    return toErrorResponse(error);
  }
}

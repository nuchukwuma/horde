/**
 * POST /api/auth/password-reset — set a new password from an emailed link.
 *
 * Does not sign the seller in: they sign in with the new password, on a
 * fresh session, after every old session has been revoked.
 */

import type { NextRequest } from 'next/server';
import { ensureDatabase, requestIp, requestUserAgent } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { clientIdentifier, enforceRateLimit } from '@/lib/ratelimit';
import { resetPasswordWithToken } from '@/lib/auth/passwordReset';
import { passwordResetSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    await ensureDatabase();
    await enforceRateLimit('auth:password-reset', `set:${clientIdentifier(request)}`);
    const { token, password } = passwordResetSchema.parse(await request.json());
    const { email } = await resetPasswordWithToken(token, password, {
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
    });
    return ok({ reset: true, email });
  } catch (error) {
    return toErrorResponse(error);
  }
}

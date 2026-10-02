/**
 * POST /api/auth/password-reset/request — email a reset link.
 *
 * Answers the same way for every address, after a fixed minimum time, so
 * neither the reply nor how long it took says whether an account exists.
 */

import type { NextRequest } from 'next/server';
import { ensureDatabase, requestIp, requestUserAgent } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { clientIdentifier, enforceRateLimit } from '@/lib/ratelimit';
import { requestPasswordReset } from '@/lib/auth/passwordReset';
import { passwordResetRequestSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

/** Longer than sending an email normally takes, so both paths look alike. */
const MIN_RESPONSE_MS = 1_500;

export async function POST(request: NextRequest) {
  const started = Date.now();
  try {
    await ensureDatabase();
    const { email } = passwordResetRequestSchema.parse(await request.json());

    await enforceRateLimit('auth:password-reset', `ip:${clientIdentifier(request)}`);
    await enforceRateLimit('auth:password-reset', `email:${email}`);

    try {
      await requestPasswordReset(email, { ip: requestIp(request), userAgent: requestUserAgent(request) });
    } catch (error) {
      // A mail outage must not answer differently for a real account than
      // for a made-up one. Logged without the address.
      console.error('[password-reset] request failed', error instanceof Error ? error.name : 'unknown');
    }

    const wait = MIN_RESPONSE_MS - (Date.now() - started);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));

    return ok({ sent: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

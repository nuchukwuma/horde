/**
 * POST /api/auth/step-up — confirm the password again on a live session.
 *
 * Payout changes demand a password confirmed in the last ten minutes
 * (assertRecentlyAuthenticated). Until this route existed, the only way to
 * satisfy that was to sign out and back in: a seller who had been signed in
 * for an hour could never connect a bank account, and nothing told them why.
 *
 * The session must already be valid — this refreshes its step-up clock, it
 * does not sign anyone in. Rate limited per user as well as per client, since
 * it is a password oracle for whoever holds the session cookie.
 */

import type { NextRequest } from 'next/server';
import { requireSession, requestIp, requestUserAgent } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { User } from '@/lib/db/models/User';
import { verifyPassword } from '@/lib/auth/password';
import { markReauthenticated } from '@/lib/auth/session';
import { stepUpSchema } from '@/lib/validation/schemas';
import { enforceRateLimit } from '@/lib/ratelimit';
import { recordAudit } from '@/lib/audit';
import { AuthenticationError } from '@/lib/errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(request, 'platform');
    await enforceRateLimit('auth:step-up', `user:${String(session.user._id)}`);

    const { password } = stepUpSchema.parse(await request.json());

    const user = await User.findById(session.user._id).select('+passwordHash');
    const valid = user ? await verifyPassword(user.passwordHash ?? '', password) : false;

    await recordAudit({
      action: valid ? 'user.step_up' : 'user.step_up.failed',
      actorUserId: session.user._id,
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
    });

    // A 401 here means "wrong password", not "signed out", and the client
    // shows the public message, so it has to say so.
    if (!valid) throw new AuthenticationError('Step-up password mismatch', 'That password isn’t right. Try again.');

    await markReauthenticated(session.sessionId);
    return ok({ confirmed: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

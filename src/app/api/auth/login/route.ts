/**
 * POST /api/auth/login
 *
 * Rate-limited, constant-ish time, and deliberately vague: a wrong password and
 * an unknown address return the same message, so the endpoint cannot be used to
 * enumerate who has an account.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { ensureDatabase, requestIp, requestUserAgent } from '@/lib/http/context';
import { toErrorResponse } from '@/lib/http/respond';
import { User } from '@/lib/db/models/User';
import { Membership } from '@/lib/db/models/Membership';
import { fakeVerifyPassword, verifyPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';
import { sessionCookieName, sessionCookieOptions } from '@/lib/auth/cookies';
import { signInSchema } from '@/lib/validation/schemas';
import { clientIdentifier, enforceRateLimit } from '@/lib/ratelimit';
import { recordAudit } from '@/lib/audit';
import { AuthenticationError } from '@/lib/errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    await ensureDatabase();
    await enforceRateLimit('auth:login', clientIdentifier(request));

    const { email, password } = signInSchema.parse(await request.json());

    const user = await User.findOne({ email }).select('+passwordHash');

    if (!user) {
      // Spend comparable time so response timing does not reveal which
      // addresses exist.
      await fakeVerifyPassword();
      throw new AuthenticationError('Invalid email or password', 'That email and password don’t match an account. Check them and try again.');
    }

    const valid = await verifyPassword(user.passwordHash ?? '', password);

    if (!valid || user.status !== 'active') {
      await recordAudit({
        action: 'user.login.failed',
        actorUserId: user._id,
        ip: requestIp(request),
        userAgent: requestUserAgent(request),
      });
      throw new AuthenticationError('Invalid email or password', 'That email and password don’t match an account. Check them and try again.');
    }

    const { token } = await createSession({
      userId: user._id,
      scope: 'platform',
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
    });

    await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
    await recordAudit({
      action: 'user.login',
      actorUserId: user._id,
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
    });

    // Send the seller straight to a site they actually own.
    const membership = await Membership.findOne({ userId: user._id }).sort({ createdAt: 1 });

    const response = NextResponse.json({
      data: {
        userId: String(user._id),
        // No store yet: /dashboard explains and offers to open one (it used
        // to send these accounts to the marketing page with no word why).
        redirectTo: membership ? `/dashboard/${membership.siteId}` : '/dashboard',
      },
    });

    response.cookies.set(
      sessionCookieName('platform'),
      token,
      sessionCookieOptions('platform'),
    );

    return response;
  } catch (error) {
    return toErrorResponse(error);
  }
}

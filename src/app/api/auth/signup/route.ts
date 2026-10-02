/**
 * POST /api/auth/signup
 *
 * Creates a seller: an account, their first site, and the owner membership
 * linking the two. Signs them in on success so they land in the dashboard
 * rather than on a login form they just set a password for.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { ensureDatabase, requestIp, requestUserAgent } from '@/lib/http/context';
import { toErrorResponse } from '@/lib/http/respond';
import { signUpSeller } from '@/lib/onboarding/signup';
import { createSession } from '@/lib/auth/session';
import { issueEmailVerification } from '@/lib/auth/emailVerification';
import { appOrigin } from '@/lib/seo/meta';
import { sessionCookieName, sessionCookieOptions } from '@/lib/auth/cookies';
import { sellerSignUpSchema } from '@/lib/validation/schemas';
import { clientIdentifier, enforceRateLimit } from '@/lib/ratelimit';
import { siteOrigin } from '@/lib/seo/meta';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    await ensureDatabase();
    await enforceRateLimit('auth:signup', clientIdentifier(request));

    const body = sellerSignUpSchema.parse(await request.json());

    const result = await signUpSeller({
      ...body,
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
    });

    const { token } = await createSession({
      userId: result.userId,
      scope: 'platform',
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
    });

    // Best effort, deliberately. A mail outage must not cost us a completed
    // signup: the account and store already exist, the seller is already
    // signed in, and they can resend from the dashboard. What they cannot do
    // until it arrives is connect a bank account, which is the only thing the
    // gate protects.
    let verificationSent = false;
    try {
      const { delivery } = await issueEmailVerification({
        user: { _id: result.userId, email: body.email, name: body.name },
        appOrigin: appOrigin(),
      });
      verificationSent = delivery.transport === 'resend';
    } catch {
      // Swallowed on purpose. The detail is in the thrown error's message,
      // which stays server-side; the seller sees an actionable prompt instead.
    }

    const response = NextResponse.json(
      {
        data: {
          verificationSent,
          siteId: String(result.siteId),
          slug: result.slug,
          // The seller's own public address, ready to copy and share. This is
          // the first thing anyone wants after creating a store.
          storeUrl: siteOrigin({ slug: result.slug, name: body.siteName }),
          redirectTo: `/dashboard/${result.siteId}`,
        },
      },
      { status: 201 },
    );

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

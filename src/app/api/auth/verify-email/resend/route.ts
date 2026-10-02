/**
 * POST /api/auth/verify-email/resend — send a fresh link to the signed-in
 * seller's own address.
 *
 * Takes no email in the body: it always sends to the address on the session's
 * own account. An endpoint that accepted an address would be a way to make our
 * mail server deliver to anyone.
 */

import type { NextRequest } from 'next/server';
import { ensureDatabase, requireSession } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { issueEmailVerification } from '@/lib/auth/emailVerification';
import { appOrigin } from '@/lib/seo/meta';
import { clientIdentifier, enforceRateLimit } from '@/lib/ratelimit';
import { ConflictError } from '@/lib/errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    await ensureDatabase();

    const session = await requireSession(request, 'platform');

    // Keyed to the account, not the IP: the cost being limited is mail sent to
    // one inbox, and rotating IPs must not raise it.
    await enforceRateLimit(
      'auth:verify-email',
      `resend:${String(session.user._id)}:${clientIdentifier(request)}`,
    );

    if (session.user.emailVerifiedAt) {
      throw new ConflictError('That address is already confirmed.');
    }

    const { delivery } = await issueEmailVerification({
      user: session.user,
      appOrigin: appOrigin(),
    });

    // Reported so a developer can tell a console-printed link from a sent one.
    return ok({ sent: true, transport: delivery.transport });
  } catch (error) {
    return toErrorResponse(error);
  }
}

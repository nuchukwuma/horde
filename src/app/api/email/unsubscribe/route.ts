/**
 * POST /api/email/unsubscribe?u=<userId>&t=<signature> — stop setup tips.
 *
 * Two callers: mail clients doing RFC 8058 one-click unsubscribe (they POST
 * `List-Unsubscribe=One-Click` to the URL in the List-Unsubscribe header), and
 * the /unsubscribe page's button. No session: the signature is the proof
 * (lib/email/unsubscribe.ts).
 *
 * POST only. A GET that unsubscribed would be triggered by link scanners.
 * Not rate-limited: the signature cannot be guessed, the action only ever
 * sends fewer emails, and the one-click caller is the mail provider's
 * servers, which a per-IP limit would throttle across all their users.
 */

import type { NextRequest } from 'next/server';
import { ensureDatabase } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { ValidationError } from '@/lib/errors';
import { optOutOfNudges, verifyUnsubscribe } from '@/lib/email/unsubscribe';
import { unsubscribeQuerySchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const parsed = unsubscribeQuerySchema.safeParse({
      u: request.nextUrl.searchParams.get('u'),
      t: request.nextUrl.searchParams.get('t'),
    });
    const invalid = new ValidationError('That unsubscribe link is not valid. Sign in to change your email settings.');
    if (!parsed.success || !verifyUnsubscribe(parsed.data.u, parsed.data.t)) throw invalid;

    await ensureDatabase();
    await optOutOfNudges(parsed.data.u);
    return ok({ unsubscribed: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

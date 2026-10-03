/**
 * GET|POST /api/cron/emails — the scheduled emails: the one verification
 * reminder (lib/email/reminders.ts), and setup tips when REENGAGEMENT_EMAILS=on
 * (lib/email/nudges.ts).
 *
 * Hourly is plenty. Same contract as /api/cron/mrmouse-sales:
 * `Authorization: Bearer <CRON_SECRET>`, and without CRON_SECRET configured
 * the route does not exist. `npm run emails:send` does the same work from a
 * server's own crontab.
 */

import type { NextRequest } from 'next/server';
import { ensureDatabase } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { AuthenticationError, NotFoundError } from '@/lib/errors';
import { constantTimeEquals } from '@/lib/auth/session';
import { sendVerificationReminders } from '@/lib/email/reminders';
import { sendNudges } from '@/lib/email/nudges';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET ?? '';
    if (secret.length < 32) throw new NotFoundError('Page');
    const given = (request.headers.get('authorization') ?? '').replace(/^Bearer /, '');
    if (!constantTimeEquals(given, secret)) throw new AuthenticationError('Bad cron secret');
    await ensureDatabase();
    const reminders = await sendVerificationReminders({ limit: 200 });
    const nudges = await sendNudges({ limit: 200 });
    return ok({ reminders, nudges });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export const GET = handle;
export const POST = handle;

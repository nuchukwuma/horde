/**
 * GET|POST /api/cron/mrmouse-sales — send sale messages MrMouse has not yet
 * confirmed, for every store.
 *
 * For a scheduler (Vercel Cron, cron-job.org, GitHub Actions…), every few
 * minutes, with `Authorization: Bearer <CRON_SECRET>`. Vercel Cron sends that
 * header itself when CRON_SECRET is set. Without CRON_SECRET configured the
 * route does not exist.
 */

import type { NextRequest } from 'next/server';
import { ensureDatabase } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { AuthenticationError, NotFoundError } from '@/lib/errors';
import { constantTimeEquals } from '@/lib/auth/session';
import { retryDueMrMouseSales } from '@/lib/integrations/mrmouseSales';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET ?? '';
    if (secret.length < 32) throw new NotFoundError('Page');
    const given = (request.headers.get('authorization') ?? '').replace(/^Bearer /, '');
    if (!constantTimeEquals(given, secret)) throw new AuthenticationError('Bad cron secret');
    await ensureDatabase();
    return ok(await retryDueMrMouseSales({ limit: 200 }));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export const GET = handle;
export const POST = handle;

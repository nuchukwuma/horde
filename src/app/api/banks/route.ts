/**
 * GET /api/banks — Nigerian banks that can receive a payout.
 *
 * Authenticated: the list is public information, but an open endpoint that
 * proxies an upstream API is free bandwidth for someone else.
 */

import type { NextRequest } from 'next/server';
import { requireSession } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { listBanks } from '@/lib/paystack/accounts';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, 'platform');

    const banks = await listBanks();

    return ok(
      banks.map((bank) => ({ code: bank.code, name: bank.name, slug: bank.slug })),
      { headers: { 'Cache-Control': 'private, max-age=3600' } },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

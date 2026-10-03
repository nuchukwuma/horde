/**
 * POST /api/auth/email-preferences { setupTips: boolean }
 *
 * The signed-in seller's own switch for setup tips. Always their own account:
 * there is no user id in the body.
 */

import type { NextRequest } from 'next/server';
import { ensureDatabase, requireSession } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { setNudgesWanted } from '@/lib/email/unsubscribe';
import { emailPreferencesSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    await ensureDatabase();
    const session = await requireSession(request, 'platform');
    const { setupTips } = emailPreferencesSchema.parse(await request.json());
    await setNudgesWanted(String(session.user._id), setupTips);
    return ok({ setupTips });
  } catch (error) {
    return toErrorResponse(error);
  }
}

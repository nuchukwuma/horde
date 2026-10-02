/**
 * POST /api/auth/accept-terms { acceptTerms: true }
 *
 * Records that the signed-in seller accepted the current Terms + Privacy
 * version. The version comes from the server, never the body: a client
 * cannot claim to have accepted something other than what is current.
 */

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession, requestIp, requestUserAgent } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { User } from '@/lib/db/models/User';
import { recordAudit } from '@/lib/audit';
import { acceptanceStamp, acceptTermsSchema, TERMS_VERSION } from '@/lib/legal/terms';

export const runtime = 'nodejs';

const bodySchema = z.object({ acceptTerms: acceptTermsSchema });

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(request, 'platform');
    bodySchema.parse(await request.json());

    await User.updateOne({ _id: session.user._id }, { $set: acceptanceStamp() });
    await recordAudit({
      action: 'user.terms.accepted',
      actorUserId: session.user._id,
      targetType: 'User',
      targetId: String(session.user._id),
      before: { version: session.user.termsAcceptedVersion ?? null },
      after: { version: TERMS_VERSION },
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
    });
    return ok({ version: TERMS_VERSION });
  } catch (error) {
    return toErrorResponse(error);
  }
}

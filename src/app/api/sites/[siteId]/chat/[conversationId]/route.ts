/**
 * One thread, from the seller's side.
 *
 * GET  — the messages, and marks them read
 * POST — reply
 */

import type { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { requireSession } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { requireSiteAccess } from '@/lib/auth/guards';
import { listMessages, markRead, postMessage } from '@/lib/chat/conversations';
import { chatMessageSchema } from '@/lib/validation/schemas';
import { clientIdentifier, enforceRateLimit } from '@/lib/ratelimit';
import { ValidationError } from '@/lib/errors';

export const runtime = 'nodejs';

function objectId(value: string): Types.ObjectId {
  if (!/^[a-f0-9]{24}$/i.test(value)) throw new ValidationError('Invalid conversation id');
  return new Types.ObjectId(value);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string; conversationId: string }> },
) {
  try {
    const { siteId, conversationId } = await params;
    const session = await requireSession(request, 'platform');
    const access = await requireSiteAccess(session, siteId, ['owner', 'staff']);

    const id = objectId(conversationId);

    const messages = await listMessages({ siteId: access.site._id, conversationId: id });
    await markRead({ siteId: access.site._id, conversationId: id, side: 'seller' });

    return ok(
      messages.map((message) => ({
        id: String(message._id),
        from: message.senderType,
        body: message.body,
        at: message.createdAt,
        // The seller sees which of their own messages were flagged. Shown
        // rather than hidden: a seller who does not know a message looked like
        // a payment solicitation cannot stop doing it.
        flagged: message.riskSignals.length > 0,
      })),
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string; conversationId: string }> },
) {
  try {
    const { siteId, conversationId } = await params;
    const session = await requireSession(request, 'platform');
    const access = await requireSiteAccess(session, siteId, ['owner', 'staff']);

    await enforceRateLimit('chat:send', `seller:${siteId}:${clientIdentifier(request)}`);

    const { body } = chatMessageSchema.parse(await request.json());

    const { message, risk } = await postMessage({
      siteId: access.site._id,
      conversationId: objectId(conversationId),
      senderType: 'seller',
      senderId: session.user._id,
      body,
    });

    return ok({
      id: String(message._id),
      from: message.senderType,
      body: message.body,
      at: message.createdAt,
      flagged: risk.flagged,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

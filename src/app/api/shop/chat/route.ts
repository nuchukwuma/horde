/**
 * Shopper side of chat, on the storefront host.
 *
 * GET  — this shopper's thread with this store
 * POST — send a message
 *
 * Requires a storefront session: a thread has to belong to someone we can
 * authenticate on their next visit, which a guest is not. This is the one
 * place in the store module where an account is not optional.
 */

import type { NextRequest } from 'next/server';
import { ensureDatabase, requirePublicSite } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { validateCustomerSessionToken } from '@/lib/auth/session';
import { sessionCookieName } from '@/lib/auth/cookies';
import { enforceRateLimit } from '@/lib/ratelimit';
import { listMessages, markRead, openConversation, postMessage } from '@/lib/chat/conversations';
import { chatMessageSchema } from '@/lib/validation/schemas';
import { AuthenticationError } from '@/lib/errors';

export const runtime = 'nodejs';

async function shopper(request: NextRequest) {
  const site = await requirePublicSite(request);
  const session = await validateCustomerSessionToken(
    request.cookies.get(sessionCookieName('storefront'))?.value,
    site._id,
  );

  if (!session) {
    throw new AuthenticationError('Sign in to message this store');
  }

  return { site, customer: session.customer };
}

export async function GET(request: NextRequest) {
  try {
    await ensureDatabase();
    const { site, customer } = await shopper(request);

    const conversation = await openConversation({
      siteId: site._id,
      customerId: customer._id,
    });

    const messages = await listMessages({
      siteId: site._id,
      conversationId: conversation._id,
    });

    // Opening the thread is reading it.
    await markRead({
      siteId: site._id,
      conversationId: conversation._id,
      side: 'customer',
    });

    return ok({
      conversationId: String(conversation._id),
      status: conversation.status,
      messages: messages.map((message) => ({
        id: String(message._id),
        from: message.senderType,
        body: message.body,
        at: message.createdAt,
      })),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureDatabase();
    const { site, customer } = await shopper(request);

    await enforceRateLimit('chat:send', `${site.slug}:${String(customer._id)}`);

    const { body } = chatMessageSchema.parse(await request.json());

    const conversation = await openConversation({
      siteId: site._id,
      customerId: customer._id,
    });

    const { message, risk } = await postMessage({
      siteId: site._id,
      conversationId: conversation._id,
      senderType: 'customer',
      senderId: customer._id,
      body,
    });

    return ok({
      id: String(message._id),
      from: message.senderType,
      body: message.body,
      at: message.createdAt,
      // The buyer sees the warning even on their own message: someone talked
      // into asking for a seller's account details is being defrauded too.
      warning: risk.warning,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

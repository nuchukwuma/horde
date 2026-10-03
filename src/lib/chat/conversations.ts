/**
 * Chat between a shopper and a store.
 *
 * Every function takes a siteId resolved from the host or from a verified
 * membership — never from a request body. A conversation is tenant-owned, so
 * the scope plugin does the filtering; what these functions add is the
 * ownership check that the plugin cannot make, namely that this customer owns
 * this thread.
 */

import { Types } from 'mongoose';
import { Conversation, type ConversationAttributes } from '../db/models/Conversation';
import { Customer } from '../db/models/Customer';
import { Message, type MessageAttributes, type MessageSender } from '../db/models/Message';
import { stripAllHtml } from '../security/sanitizeHtml';
import { assessPaymentRisk, type PaymentRiskResult } from './paymentRisk';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors';
import { runWithTenant } from '../tenant/context';

/** A thread and its unread counts, as the seller's inbox needs it. */
export interface ConversationSummary {
  id: string;
  customerId: string;
  status: string;
  lastMessageAt: Date;
  lastMessagePreview: string;
  unreadForSeller: number;
  unreadForCustomer: number;
  flaggedMessageCount: number;
  /** Who the seller is talking to. Only on the seller's inbox listing. */
  customerName?: string;
  customerEmail?: string;
}

function summarise(conversation: ConversationAttributes): ConversationSummary {
  return {
    id: String(conversation._id),
    customerId: String(conversation.customerId),
    status: conversation.status,
    lastMessageAt: conversation.lastMessageAt,
    lastMessagePreview: conversation.lastMessagePreview,
    unreadForSeller: conversation.unreadForSeller,
    unreadForCustomer: conversation.unreadForCustomer,
    flaggedMessageCount: conversation.flaggedMessageCount,
  };
}

/**
 * The shopper's single thread with this store, created on first use.
 *
 * Upsert rather than find-then-create: two messages sent at once would
 * otherwise race and one would fail on the unique index.
 */
export async function openConversation(input: {
  siteId: Types.ObjectId;
  customerId: Types.ObjectId;
  orderId?: Types.ObjectId | null;
}): Promise<ConversationAttributes> {
  const tenant = { siteId: String(input.siteId) };

  const conversation = await runWithTenant(tenant, () =>
    Conversation.findOneAndUpdate(
      { customerId: input.customerId },
      {
        $setOnInsert: {
          customerId: input.customerId,
          orderId: input.orderId ?? null,
          status: 'open',
          lastMessageAt: new Date(),
          lastMessagePreview: '',
          unreadForSeller: 0,
          unreadForCustomer: 0,
          flaggedMessageCount: 0,
        },
      },
      { new: true, upsert: true },
    ),
  );

  if (!conversation) throw new NotFoundError('Conversation');
  return conversation;
}

export interface PostMessageInput {
  siteId: Types.ObjectId;
  conversationId: Types.ObjectId;
  senderType: MessageSender;
  senderId: Types.ObjectId;
  body: string;
}

export interface PostMessageResult {
  message: MessageAttributes;
  /** Present when the payment-risk detector fired. Shown to the BUYER. */
  risk: PaymentRiskResult;
}

export async function postMessage(input: PostMessageInput): Promise<PostMessageResult> {
  // Plain text only. Sanitise on write, as everywhere else — see
  // security/sanitizeHtml.ts for why write-time rather than render-time.
  const body = stripAllHtml(input.body).trim();

  if (!body) throw new ValidationError('Write a message first.');
  if (body.length > 4000) throw new ValidationError('That message is too long.');

  const tenant = { siteId: String(input.siteId) };

  const conversation = await runWithTenant(tenant, () =>
    Conversation.findById(input.conversationId),
  );
  if (!conversation) throw new NotFoundError('Conversation');

  if (conversation.status === 'closed') {
    throw new ValidationError('This conversation is closed.');
  }

  // A customer may only post to their own thread. The tenant scope already
  // stops cross-store access; this stops cross-customer access within a store.
  if (
    input.senderType === 'customer' &&
    String(conversation.customerId) !== String(input.senderId)
  ) {
    throw new ForbiddenError('That conversation does not belong to you');
  }

  const risk = assessPaymentRisk(body);

  const message = await runWithTenant(tenant, () =>
    Message.create({
      conversationId: conversation._id,
      senderType: input.senderType,
      senderId: input.senderId,
      body,
      riskSignals: risk.signals,
    }),
  );

  // The thread summary and unread counts. Incremented for the OTHER party.
  await runWithTenant(tenant, () =>
    Conversation.updateOne(
      { _id: conversation._id },
      {
        $set: {
          lastMessageAt: new Date(),
          lastMessagePreview: body.slice(0, 200),
        },
        $inc: {
          ...(input.senderType === 'customer'
            ? { unreadForSeller: 1 }
            : { unreadForCustomer: 1 }),
          ...(risk.flagged ? { flaggedMessageCount: 1 } : {}),
        },
      },
    ),
  );

  return { message, risk };
}

export async function listMessages(input: {
  siteId: Types.ObjectId;
  conversationId: Types.ObjectId;
  limit?: number;
}): Promise<MessageAttributes[]> {
  const tenant = { siteId: String(input.siteId) };
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);

  return runWithTenant(tenant, () =>
    Message.find({ conversationId: input.conversationId })
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean(),
  ) as Promise<MessageAttributes[]>;
}

/** The seller's inbox. */
export async function listConversations(input: {
  siteId: Types.ObjectId;
  limit?: number;
}): Promise<ConversationSummary[]> {
  const tenant = { siteId: String(input.siteId) };
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);

  return runWithTenant(tenant, async () => {
    const rows = await Conversation.find({}).sort({ lastMessageAt: -1 }).limit(limit);
    // The store's own signed-in customers: the seller sees who wrote, as on
    // their orders. One query for the page, not one per thread.
    const customers = await Customer.find({ _id: { $in: rows.map((row) => row.customerId) } })
      .select('name email')
      .lean();
    const byId = new Map(customers.map((customer) => [String(customer._id), customer]));
    return rows.map((row) => {
      const customer = byId.get(String(row.customerId));
      return { ...summarise(row), customerName: customer?.name, customerEmail: customer?.email };
    });
  });
}

/**
 * Clear one side's unread count.
 *
 * Set to zero rather than decremented: a decrement can drift below what was
 * actually read when two tabs are open, and a negative badge is worse than a
 * slightly eager one.
 */
export async function markRead(input: {
  siteId: Types.ObjectId;
  conversationId: Types.ObjectId;
  side: MessageSender;
}): Promise<void> {
  const tenant = { siteId: String(input.siteId) };

  await runWithTenant(tenant, () =>
    Conversation.updateOne(
      { _id: input.conversationId },
      {
        $set:
          input.side === 'seller' ? { unreadForSeller: 0 } : { unreadForCustomer: 0 },
      },
    ),
  );
}

export { summarise as summariseConversation };

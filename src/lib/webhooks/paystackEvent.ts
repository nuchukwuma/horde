/**
 * The Paystack webhook contract, narrowed to what we consume.
 *
 * A webhook body is untrusted external data. It is parsed and classified here,
 * and nothing downstream reads a raw field off it without going through this
 * module. In particular the amount in the payload is never trusted — the
 * processor re-reads it from Paystack's verify endpoint.
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * Deliberately loose on `data`: Paystack adds fields, and rejecting a payload
 * because it grew a key we do not read would drop real payments. Only the
 * envelope is pinned.
 */
export const paystackEventSchema = z.object({
  event: z.string().min(1).max(100),
  data: z.record(z.unknown()),
});

export type PaystackEvent = z.infer<typeof paystackEventSchema>;

export function parsePaystackEvent(rawBody: string): PaystackEvent {
  return paystackEventSchema.parse(JSON.parse(rawBody));
}

export type EventKind =
  | 'charge_success'
  | 'charge_failed'
  | 'refund_processed'
  | 'refund_failed'
  | 'refund_pending'
  | 'dispute_opened'
  | 'dispute_resolved'
  | 'transfer_success'
  | 'transfer_failed'
  | 'ignored';

const EVENT_KINDS: Record<string, EventKind> = {
  'charge.success': 'charge_success',
  'charge.failed': 'charge_failed',
  'refund.processed': 'refund_processed',
  'refund.failed': 'refund_failed',
  'refund.pending': 'refund_pending',
  'charge.dispute.create': 'dispute_opened',
  'charge.dispute.remind': 'dispute_opened',
  'charge.dispute.resolve': 'dispute_resolved',
  'transfer.success': 'transfer_success',
  'transfer.failed': 'transfer_failed',
  'transfer.reversed': 'transfer_failed',
};

/**
 * Map an event name to something we act on.
 *
 * Unknown events classify as 'ignored' rather than throwing: Paystack adds
 * event types, and a 500 on an unrecognised one would make them retry it
 * forever. Ignored events are still recorded, so a new type is visible rather
 * than silently dropped.
 */
export function classifyEvent(eventName: string): EventKind {
  return EVENT_KINDS[eventName] ?? 'ignored';
}

/**
 * Stable identity for an event, used as the idempotency key.
 *
 * Paystack does not send an explicit event id, so one is derived. The event
 * name is part of the key because a dispute on a transaction is a different
 * event from the charge that created it — keying on the transaction alone would
 * make the dispute look like a duplicate.
 */
export function deriveEventId(event: PaystackEvent): string {
  const { data } = event;

  const id = data.id;
  if (typeof id === 'number' || (typeof id === 'string' && id.length > 0)) {
    return `${event.event}:${id}`;
  }

  const reference = data.reference;
  if (typeof reference === 'string' && reference.length > 0) {
    return `${event.event}:${reference}`;
  }

  // Neither present: fall back to a digest of the payload so that an identical
  // redelivery still deduplicates. Never throw — an unkeyable event must still
  // be recorded.
  const digest = createHash('sha256')
    .update(JSON.stringify(data))
    .digest('hex')
    .slice(0, 16);

  return `${event.event}:sha256:${digest}`;
}

/** Transaction reference, when the payload carries one. */
export function extractReference(event: PaystackEvent): string | null {
  const { data } = event;

  if (typeof data.reference === 'string' && data.reference) return data.reference;

  // Refund payloads nest the original transaction.
  const transaction = data.transaction as Record<string, unknown> | undefined;
  if (transaction && typeof transaction.reference === 'string') return transaction.reference;

  return null;
}

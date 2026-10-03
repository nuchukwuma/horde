/**
 * Every email HordeMart sends, as a function from data to
 * { subject, text, html }. Callers pass the values; this file decides the
 * words. Nothing here reads the database or the environment, so every
 * template is testable as a pure function.
 */

import { renderEmail, type EmailBlock } from './layout';

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

const ACCOUNT_REASON = 'You’re getting this because you have a HordeMart account.';

/** "Hi Ada," — or a plain greeting when there is no usable name. */
function hi(name: string | null | undefined): string {
  const trimmed = String(name ?? '').trim();
  return trimmed ? `Hi ${trimmed},` : 'Hi there,';
}

// ---------------------------------------------------------------- sellers

export function verifyEmail(input: { name: string; link: string }): EmailContent {
  const subject = 'Confirm your email for HordeMart';
  return {
    subject,
    ...renderEmail({
      preheader: 'One click, and you can connect a bank account and start taking payments.',
      heading: 'Confirm your email',
      greeting: hi(input.name),
      blocks: [
        {
          kind: 'p',
          text: 'Welcome to HordeMart. Confirm this address so you can connect a bank account and start taking payments.',
        },
        { kind: 'button', button: { label: 'Confirm my email', url: input.link } },
        { kind: 'note', text: 'This link expires in 24 hours.' },
        {
          kind: 'note',
          text: 'If you did not create a HordeMart account, ignore this email — nothing was set up in your name.',
        },
      ],
      reason: 'You’re getting this because someone signed up for HordeMart with this address.',
    }),
  };
}

/** The one follow-up for a seller who has not clicked the first link. */
export function verifyEmailReminder(input: { name: string; link: string }): EmailContent {
  const subject = 'Your HordeMart store is waiting — confirm your email';
  return {
    subject,
    ...renderEmail({
      preheader: 'You can’t take payments until your email is confirmed. It takes one click.',
      heading: 'One step left before you can get paid',
      greeting: hi(input.name),
      blocks: [
        {
          kind: 'p',
          text: 'You signed up for HordeMart but haven’t confirmed your email yet. Until you do, you can build your store but you can’t connect a bank account, so customers can’t pay you.',
        },
        { kind: 'button', button: { label: 'Confirm my email', url: input.link } },
        {
          kind: 'note',
          text: 'This is a new link; any earlier one has stopped working. It expires in 24 hours. We won’t send another reminder.',
        },
        {
          kind: 'note',
          text: 'If you did not create a HordeMart account, ignore this email — nothing was set up in your name.',
        },
      ],
      reason: 'You’re getting this because someone signed up for HordeMart with this address.',
    }),
  };
}

export function passwordResetEmail(input: { name: string; link: string }): EmailContent {
  const subject = 'Reset your HordeMart password';
  return {
    subject,
    ...renderEmail({
      preheader: 'Choose a new password. The link works once and expires in an hour.',
      heading: 'Reset your password',
      greeting: hi(input.name),
      blocks: [
        {
          kind: 'p',
          text: 'Someone — hopefully you — asked to reset the password for your HordeMart account.',
        },
        { kind: 'button', button: { label: 'Choose a new password', url: input.link } },
        {
          kind: 'note',
          text: 'This link works once and expires in 1 hour. Resetting signs you out on every device.',
        },
        { kind: 'note', text: 'If you did not ask for this, ignore this email: your password has not changed.' },
      ],
      reason: ACCOUNT_REASON,
    }),
  };
}

export function payoutChangedEmail(input: {
  name: string;
  storeName: string;
  accountName: string;
  accountNumberLast4: string;
}): EmailContent {
  const subject = `Your payout bank account was changed — ${input.storeName}`;
  return {
    subject,
    ...renderEmail({
      preheader: `Payments for ${input.storeName} will now go to the account ending ${input.accountNumberLast4}.`,
      heading: 'Your payout bank account was changed',
      greeting: hi(input.name),
      blocks: [
        { kind: 'p', text: `The bank account that receives payments for ${input.storeName} was just set to:` },
        { kind: 'box', lines: [`${input.accountName}, account ending ${input.accountNumberLast4}`] },
        { kind: 'p', text: 'If this was you, there is nothing to do.' },
        {
          kind: 'p',
          text: 'If it was NOT you, change your HordeMart password now, put your own bank details back under Payouts in your dashboard, and contact HordeMart support straight away.',
        },
      ],
      reason: 'We send this every time payout details change, so you hear about it before the next settlement.',
    }),
  };
}

export function newOrderSellerEmail(input: {
  name: string;
  storeName: string;
  orderNumber: string;
  buyer: string;
  total: string;
  itemLines: string[];
  pickup: boolean;
  orderUrl: string;
}): EmailContent {
  const subject = `New order ${input.orderNumber} — ${input.total}`;
  return {
    subject,
    ...renderEmail({
      preheader: `${input.buyer} just paid ${input.total} at ${input.storeName}.`,
      heading: `New order — ${input.total}`,
      greeting: hi(input.name),
      blocks: [
        { kind: 'p', text: `${input.buyer} just paid ${input.total} at ${input.storeName}:` },
        { kind: 'box', lines: input.itemLines },
        {
          kind: 'p',
          text: input.pickup
            ? 'They will collect it (or nothing needs delivering).'
            : 'Their phone number and delivery address are on the order.',
        },
        { kind: 'button', button: { label: 'Open the order', url: input.orderUrl } },
        { kind: 'note', text: 'Paystack settles your share to your bank account directly.' },
      ],
      reason: `You’re getting this because you own ${input.storeName} on HordeMart.`,
    }),
  };
}

// ---------------------------------------------------------------- shoppers

/** A store's own email to its shopper: the store's name leads, not ours. */
function storeBrand(storeName: string) {
  return { name: storeName, byline: 'on HordeMart' };
}

export function orderReceiptEmail(input: {
  customerName: string | null | undefined;
  storeName: string;
  orderNumber: string;
  total: string;
  itemLines: string[];
  deliveryLine: string;
  receiptUrl: string;
  messagesUrl: string;
}): EmailContent {
  const subject = `Your order from ${input.storeName} (${input.orderNumber})`;
  return {
    subject,
    ...renderEmail({
      preheader: `${input.storeName} has your payment of ${input.total}.`,
      heading: 'Thank you for your order',
      greeting: hi(input.customerName),
      brand: storeBrand(input.storeName),
      blocks: [
        { kind: 'p', text: `${input.storeName} has your payment of ${input.total}.` },
        { kind: 'box', lines: [...input.itemLines, `Order ${input.orderNumber}`] },
        { kind: 'p', text: input.deliveryLine },
        { kind: 'button', button: { label: 'View your receipt', url: input.receiptUrl } },
        { kind: 'link', label: `Questions? Message ${input.storeName}`, url: input.messagesUrl },
      ],
      reason: `You’re getting this because you placed an order with ${input.storeName}.`,
    }),
  };
}

export function customerVerifyEmail(input: {
  name: string;
  storeName: string;
  link: string;
}): EmailContent {
  const subject = `Confirm your email for ${input.storeName}`;
  return {
    subject,
    ...renderEmail({
      preheader: `Confirm the address on your ${input.storeName} account.`,
      heading: 'Confirm your email',
      greeting: hi(input.name),
      brand: storeBrand(input.storeName),
      blocks: [
        {
          kind: 'p',
          text: `Thanks for creating an account with ${input.storeName}. Confirm this address so receipts and replies from the store reach you.`,
        },
        { kind: 'button', button: { label: 'Confirm my email', url: input.link } },
        { kind: 'note', text: 'This link expires in 24 hours.' },
        {
          kind: 'note',
          text: `If you did not create an account with ${input.storeName}, ignore this email.`,
        },
      ],
      reason: `You’re getting this because someone created an account with ${input.storeName} using this address.`,
    }),
  };
}

// ---------------------------------------------------------------- nudges
//
// Not transactional. Off unless REENGAGEMENT_EMAILS=on, and every one carries
// a one-click unsubscribe (lib/email/nudges.ts).

export type NudgeKind = 'no_products' | 'no_payout';

export function nudgeEmail(input: {
  kind: NudgeKind;
  name: string;
  storeName: string;
  actionUrl: string;
  unsubscribeUrl: string;
}): EmailContent {
  const copy: Record<NudgeKind, { subject: string; heading: string; body: string[]; label: string }> = {
    no_products: {
      subject: `${input.storeName} has no products yet`,
      heading: 'Add your first product',
      body: [
        `Your store ${input.storeName} is live, but there’s nothing in it for customers to buy yet.`,
        'A photo, a name and a price is enough to start. You can add the rest later.',
      ],
      label: 'Add a product',
    },
    no_payout: {
      subject: `${input.storeName} can’t take payments yet`,
      heading: 'Connect your bank account',
      body: [
        `Customers can browse ${input.storeName}, but they can’t pay until you connect a bank account.`,
        'Paystack pays your share straight into that account after each sale. It takes about two minutes.',
      ],
      label: 'Connect my bank account',
    },
  };
  const c = copy[input.kind];
  const blocks: EmailBlock[] = [
    ...c.body.map((text) => ({ kind: 'p' as const, text })),
    { kind: 'button', button: { label: c.label, url: input.actionUrl } },
  ];
  return {
    subject: c.subject,
    ...renderEmail({
      preheader: c.body[0],
      heading: c.heading,
      greeting: hi(input.name),
      blocks,
      reason: `You’re getting this because you set up ${input.storeName} on HordeMart. We send at most one of these tips every few days.`,
      unsubscribeUrl: input.unsubscribeUrl,
    }),
  };
}

/**
 * Emails sent once an order is paid: the seller's "new order", the buyer's
 * receipt. Called only by the call that actually moved the order to paid
 * (confirmChargeByReference), so a retried webhook does not send twice.
 *
 * Best effort. The money has moved and the ledger is written; a mail outage
 * must not turn that into an error Paystack retries. And never the log
 * transport in production, which would print a buyer's details into a log.
 *
 * Deliberately thin on personal data: the seller's email names the buyer and
 * the items and links to the dashboard for the phone number and address,
 * rather than copying them into another inbox.
 */

import { Site } from '../db/models/Site';
import { User } from '../db/models/User';
import type { OrderAttributes } from '../db/models/Order';
import { runWithoutTenantScope } from '../tenant/context';
import { assertEmailConfigured, sendEmail } from '../email/transport';
import { appOrigin, siteOrigin } from '../seo/meta';
import { formatKobo } from '../money/kobo';

function itemLines(order: OrderAttributes): string[] {
  return order.items.map((item) => `  ${item.quantity} × ${item.title} — ${formatKobo(item.lineTotalKobo)}`);
}

export async function notifyOrderPaid(order: OrderAttributes): Promise<void> {
  try {
    assertEmailConfigured();
    const site = await runWithoutTenantScope('reading the Site an order belongs to, to email its owner', () =>
      Site.findById(order.siteId),
    );
    if (!site) return;
    const owner = await User.findById(site.ownerId).select('email name');

    const total = formatKobo(order.totalKobo);
    const sends: Array<Promise<unknown>> = [];

    if (owner) {
      sends.push(
        sendEmail({
          to: owner.email,
          subject: `New order ${order.orderNumber} — ${total}`,
          text: [
            `Hi ${owner.name},`,
            '',
            `${order.customerName || order.customerEmail} just paid ${total} at ${site.name}:`,
            '',
            ...itemLines(order),
            '',
            order.delivery?.method === 'pickup'
              ? 'They will collect it (or nothing needs delivering).'
              : 'Their phone number and delivery address are on the order:',
            `${appOrigin()}/dashboard/${String(site._id)}/orders/${String(order._id)}`,
            '',
            'Paystack settles your share to your bank account directly.',
          ].join('\n'),
        }),
      );
    }

    sends.push(
      sendEmail({
        to: order.customerEmail,
        subject: `Your order from ${site.name} (${order.orderNumber})`,
        text: [
          `Hi ${order.customerName || 'there'},`,
          '',
          `Thank you — ${site.name} has your payment of ${total}.`,
          '',
          ...itemLines(order),
          '',
          order.delivery?.method === 'delivery'
            ? `${site.name} will contact you about delivery to ${order.delivery.city}, ${order.delivery.state}.`
            : `${site.name} will be in touch about collecting your order.`,
          '',
          `Your receipt: ${siteOrigin(site)}/checkout/complete?reference=${order.paystack?.reference ?? ''}`,
          `Questions? Message ${site.name}: ${siteOrigin(site)}/account/messages`,
        ].join('\n'),
      }),
    );

    const results = await Promise.allSettled(sends);
    if (results.some((result) => result.status === 'rejected')) {
      console.error('[order] a paid-order email could not be sent', String(order._id));
    }
  } catch {
    console.error('[order] paid-order emails skipped', String(order._id));
  }
}

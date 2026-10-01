import { notFound } from 'next/navigation';
import { requireStorefront } from '@/lib/tenant/storefront';
import { withSite } from '@/lib/tenant/loadSite';
import { isModuleEnabled } from '@/lib/content/modules';
import { Order } from '@/lib/db/models/Order';
import { confirmChargeByReference } from '@/lib/webhooks/processPaystackEvent';
import { enforceRateLimit } from '@/lib/ratelimit';
import { formatDateTime, formatNaira } from '@/lib/ui/format';
import ReceiptEffects from '@/components/shop/ReceiptEffects';

/**
 * Where Paystack sends the shopper back: /checkout/complete?reference=…
 *
 * The order is looked up inside THIS store's tenant scope, so a reference
 * from another store is simply not found. References are 128 random bits,
 * which is what makes showing a receipt to whoever holds the link acceptable
 * — and even so, the email is masked and nothing about payment method or
 * card is shown.
 *
 * A pending order is confirmed here by asking Paystack directly, through the
 * same function the webhook uses (amount and currency must match before
 * anything is marked paid). Rate limited per reference, since each call
 * spends Paystack quota.
 */

export const metadata = { title: 'Your order', robots: { index: false } };

const REFERENCE = /^hm_[a-f0-9]{32}$/;

function maskEmail(email) {
  const [user, domain] = String(email ?? '').split('@');
  if (!domain) return '';
  return `${user.slice(0, 1)}${'•'.repeat(Math.max(2, Math.min(user.length - 1, 6)))}@${domain}`;
}

async function findOrder(site, reference) {
  return withSite(site, () => Order.findOne({ 'paystack.reference': reference }).lean());
}

export default async function CheckoutComplete({ params, searchParams }) {
  const site = await requireStorefront(params);
  if (!isModuleEnabled(site, 'store')) notFound();

  const { reference } = await searchParams;
  if (typeof reference !== 'string' || !REFERENCE.test(reference)) notFound();

  let order = await findOrder(site, reference);
  if (!order) notFound();

  if (order.status === 'pending') {
    try {
      await enforceRateLimit('checkout:confirm', `ref:${reference}`);
      await confirmChargeByReference(reference);
      order = (await findOrder(site, reference)) ?? order;
    } catch {
      // Paystack unreachable, not configured, or rate limited: show pending
      // and let the webhook finish the job. Nothing here is user-actionable.
    }
  }

  const status = ['paid', 'partially_refunded', 'refunded'].includes(order.status)
    ? 'paid'
    : order.status === 'failed'
      ? 'failed'
      : 'pending';

  const copy = {
    paid: {
      badge: '✓',
      title: 'Thank you — you’ve paid!',
      lede: `${site.name} has your order and will be in touch about delivery. A receipt is on its way to ${maskEmail(order.customerEmail)}.`,
    },
    pending: {
      badge: <span>◌</span>,
      title: 'Confirming your payment…',
      lede: 'Paystack is confirming the payment. This page updates by itself — you don’t need to pay again.',
    },
    failed: {
      badge: '✕',
      title: 'That payment didn’t go through',
      lede: 'No money was taken for this order. Your basket is still saved, so you can try again.',
    },
  }[status];

  return (
    <div className="container section-sm">
      <ReceiptEffects status={status} />

      <section className="order" aria-live="polite">
        {status === 'paid' ? (
          <div className="confetti" aria-hidden="true">
            {Array.from({ length: 24 }, (_, i) => (
              <i
                key={i}
                style={{
                  '--x': `${(i * 41) % 100}%`,
                  '--d': `${(i % 8) * 70}ms`,
                  '--c': ['var(--sun)', 'var(--palm)', 'var(--accent)', 'var(--indigo)', 'var(--clay)'][i % 5],
                  '--sway': `${((i % 7) - 3) * 14}px`,
                  '--fall': '420px',
                }}
              />
            ))}
          </div>
        ) : null}

        <div className={`order__badge order__badge--${status}`} aria-hidden="true">
          {copy.badge}
        </div>
        <h1 className="order__title">{copy.title}</h1>
        <p className="order__lede">{copy.lede}</p>

        <div className="order__meta">
          <span>
            Order <strong>{order.orderNumber}</strong>
          </span>
          <span className="muted">{formatDateTime(order.createdAt)}</span>
        </div>

        <ul className="order__items">
          {order.items.map((item) => (
            <li key={String(item.productId)}>
              <span>
                {item.quantity} × {item.title}
              </span>
              <span className="money">{formatNaira(item.lineTotalKobo)}</span>
            </li>
          ))}
        </ul>

        <div className="order__total">
          <span>{status === 'paid' ? 'Paid' : 'Total'}</span>
          <span className="money">{formatNaira(order.totalKobo)}</span>
        </div>

        <div className="order__actions">
          {status === 'failed' ? (
            <a className="btn btn--primary btn--lg" href="/cart">
              Back to basket
            </a>
          ) : (
            <a className="btn btn--primary btn--lg" href="/shop">
              Keep shopping
            </a>
          )}
          <a className="btn btn--lg" href="/account/messages">
            Message {site.name}
          </a>
        </div>
      </section>
    </div>
  );
}

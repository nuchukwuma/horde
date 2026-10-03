import { requireDashboardAccess } from '@/lib/dashboard/access';
import { withSite } from '@/lib/tenant/loadSite';
import { countOrdersToSend, listOrdersForSeller } from '@/lib/orders/sellerOrders';
import { siteOrigin } from '@/lib/seo/meta';
import { formatDateTime, formatNaira } from '@/lib/ui/format';
import DashboardHeader from '@/components/dashboard/DashboardHeader';

/**
 * Orders: what has been bought, by whom, and whether it has gone out.
 * Opens on paid orders — the ones to pack and send.
 */

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Orders', robots: { index: false } };

const TABS = [
  ['paid', 'Paid'],
  ['refunded', 'Refunded'],
  ['unpaid', 'Not paid'],
];

const STATUS = {
  paid: ['badge--good', '● Paid'],
  partially_refunded: ['badge--warning', '◐ Part refunded'],
  disputed: ['badge--critical', '▲ Disputed'],
  refunded: ['', '↺ Refunded'],
  pending: ['', '○ Not paid'],
  failed: ['badge--critical', '✕ Payment failed'],
  cancelled: ['', '✕ Cancelled'],
};

export default async function OrdersPage({ params, searchParams }) {
  const { siteId } = await params;
  const { show } = await searchParams;
  const filter = TABS.some(([key]) => key === show) ? show : 'paid';
  const { access } = await requireDashboardAccess(siteId, 'orders:read');
  const site = access.site;
  const { orders, toSend } = await withSite(site, async () => ({
    orders: await listOrdersForSeller(filter),
    toSend: await countOrdersToSend(),
  }));

  return (
    <div className="shell">
      <DashboardHeader siteId={siteId} current="orders" storeUrl={siteOrigin(site)} modules={site.modules} />
      <main id="main" className="container" style={{ paddingBlock: '28px 64px', maxWidth: 900 }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>Orders</h1>
        <p className="secondary" style={{ margin: '4px 0 16px', fontSize: 14 }}>
          {toSend > 0 ? `${toSend} paid order${toSend === 1 ? '' : 's'} waiting to be sent.` : 'Nothing waiting to be sent.'}
        </p>

        <nav className="tabs" aria-label="Show orders">
          {TABS.map(([key, label]) => (
            <a key={key} href={`/dashboard/${siteId}/orders${key === 'paid' ? '' : `?show=${key}`}`} aria-current={filter === key ? 'page' : undefined}>
              {label}
            </a>
          ))}
        </nav>

        {orders.length === 0 ? (
          <div className="card empty">
            {filter === 'paid'
              ? 'No paid orders yet. They appear here as soon as a customer pays.'
              : filter === 'refunded'
                ? 'No refunded orders.'
                : 'No unfinished checkouts.'}
          </div>
        ) : (
          <ul className="product-list">
            {orders.map((order) => {
              const [tone, label] = STATUS[order.status] ?? ['', order.status];
              const toShip = ['paid', 'partially_refunded'].includes(order.status);
              return (
                <li key={order.id}>
                  <a className="product-row card order-row" href={`/dashboard/${siteId}/orders/${order.id}`}>
                    <span className="product-row__main">
                      <span className="product-row__title">
                        {order.customerName || order.customerEmail}
                        <span className="order-row__number"> · {order.orderNumber}</span>
                      </span>
                      <span className="order-row__summary">
                        {order.items.map((item) => `${item.quantity} × ${item.title}`).join(', ')}
                      </span>
                      <span className="product-row__meta">
                        <span className={`badge ${tone}`}>{label}</span>
                        {toShip ? (
                          order.fulfilledAt ? (
                            <span className="badge badge--good">✓ Sent</span>
                          ) : (
                            <span className="badge badge--warning">▲ To send</span>
                          )
                        ) : null}
                        {order.delivery?.method === 'pickup' ? <span className="badge">Collecting</span> : null}
                        <span className="order-row__date">{formatDateTime(order.createdAt)}</span>
                      </span>
                    </span>
                    <span className="product-row__price money">{formatNaira(order.totalKobo)}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}

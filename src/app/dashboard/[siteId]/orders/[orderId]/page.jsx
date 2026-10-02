import { notFound } from 'next/navigation';
import { requireDashboardAccess } from '@/lib/dashboard/access';
import { withSite } from '@/lib/tenant/loadSite';
import { findOrderForSeller } from '@/lib/orders/sellerOrders';
import { siteOrigin } from '@/lib/seo/meta';
import { formatDateTime, formatNaira } from '@/lib/ui/format';
import { formatNigerianPhone } from '@/lib/shop/nigeria';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import OrderActions from '@/components/dashboard/OrderActions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Order', robots: { index: false } };

function can(access, permission) {
  return access.role === 'owner' || access.role === 'platform_admin' || access.permissions.includes(permission);
}

export default async function OrderPage({ params }) {
  const { siteId, orderId } = await params;
  const { access } = await requireDashboardAccess(siteId, 'orders:read');
  const site = access.site;
  const order = await withSite(site, () => findOrderForSeller(orderId));
  if (!order) notFound();

  const phone = formatNigerianPhone(order.customerPhone);
  const waNumber = order.customerPhone?.replace(/^\+/, '');

  return (
    <div className="shell">
      <DashboardHeader siteId={siteId} current="orders" storeUrl={siteOrigin(site)} modules={site.modules} />
      <main id="main" className="container container--narrow" style={{ paddingBlock: '28px 64px' }}>
        <p style={{ margin: '0 0 6px' }}>
          <a href={`/dashboard/${siteId}/orders`}>← Orders</a>
        </p>
        <h1 style={{ fontSize: 24, margin: 0 }}>Order {order.orderNumber}</h1>
        <p className="secondary" style={{ margin: '4px 0 18px', fontSize: 14 }}>
          Placed {formatDateTime(order.createdAt)}
          {order.paidAt ? ` · paid ${formatDateTime(order.paidAt)}` : ''}
        </p>

        <OrderActions
          siteId={siteId}
          orderId={order.id}
          status={order.status}
          fulfilledAt={order.fulfilledAt}
          canFulfil={can(access, 'orders:fulfil')}
          canRefund={can(access, 'orders:refund')}
        />

        <section className="card" style={{ marginTop: 16 }}>
          <h2 className="product-form__title">Customer</h2>
          <dl className="payout-summary">
            <div>
              <dt>Name</dt>
              <dd>{order.customerName || '—'}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>
                {phone ? (
                  <>
                    <a href={`tel:${order.customerPhone}`}>{phone}</a> ·{' '}
                    <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noopener noreferrer">
                      WhatsApp
                    </a>
                  </>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>
                <a href={`mailto:${order.customerEmail}`}>{order.customerEmail}</a>
              </dd>
            </div>
          </dl>
        </section>

        <section className="card" style={{ marginTop: 16 }}>
          <h2 className="product-form__title">{order.delivery?.method === 'pickup' ? 'Collection' : 'Delivery'}</h2>
          {order.delivery?.method === 'delivery' ? (
            <address className="order-address">
              {order.delivery.address}
              <br />
              {order.delivery.city}, {order.delivery.state}
            </address>
          ) : order.delivery?.method === 'pickup' ? (
            <p style={{ margin: 0 }}>The customer will collect it, or nothing needs delivering.</p>
          ) : (
            <p className="secondary" style={{ margin: 0 }}>
              No delivery details: this order was placed before checkout asked for them. Contact the customer.
            </p>
          )}
          {order.delivery?.note ? (
            <p className="order-note">
              <strong>Note:</strong> {order.delivery.note}
            </p>
          ) : null}
        </section>

        <section className="card" style={{ marginTop: 16 }}>
          <h2 className="product-form__title">Items</h2>
          <ul className="order-items">
            {order.items.map((item, index) => (
              <li key={index}>
                <span>
                  {item.quantity} × {item.title}
                </span>
                <span className="money">{formatNaira(item.lineTotalKobo)}</span>
              </li>
            ))}
          </ul>
          <dl className="order-totals">
            <div>
              <dt>Customer paid</dt>
              <dd className="money">{formatNaira(order.totalKobo)}</dd>
            </div>
            <div>
              <dt>Your share, after fees</dt>
              <dd className="money">{formatNaira(order.sellerNetKobo)}</dd>
            </div>
          </dl>
        </section>
      </main>
    </div>
  );
}

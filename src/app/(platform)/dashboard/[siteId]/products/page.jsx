import { requireDashboardAccess } from '@/lib/dashboard/access';
import { withSite } from '@/lib/tenant/loadSite';
import { listProductsForSeller } from '@/lib/products/products';
import { limitsFor } from '@/lib/billing/quota';
import { isModuleEnabled } from '@/lib/content/modules';
import { siteOrigin } from '@/lib/seo/meta';
import { formatNaira } from '@/lib/ui/format';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import { cookies } from 'next/headers';
import MrMousePromo from '@/components/dashboard/MrMousePromo';
import { PROMO_COOKIE, shouldSuggestMrMouse } from '@/lib/integrations/mrmousePromo';
import { mrmouseState } from '@/lib/integrations/mrmouseService';

/**
 * The seller's catalogue: what is for sale, what is hidden, what is running
 * low. Archived products are left out (they can be restored by support).
 */

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Products', robots: { index: false } };

export default async function ProductsPage({ params, searchParams }) {
  const { siteId } = await params;
  const { saved } = await searchParams;
  const { access } = await requireDashboardAccess(siteId, 'products:read');
  const site = access.site;
  const products = await withSite(site, () => listProductsForSeller());
  const limit = limitsFor(site).products;
  const storeOn = isModuleEnabled(site, 'store');
  const storeUrl = siteOrigin(site);
  const suggestMrMouse = shouldSuggestMrMouse({
    storeOn,
    productCount: products.length,
    // Paused for new terms still counts: they need "reconnect", not "try it".
    connected: mrmouseState(site).connected || mrmouseState(site).termsOutdated,
    snoozed: Boolean((await cookies()).get(PROMO_COOKIE)?.value),
  });

  return (
    <div className="shell">
      <DashboardHeader siteId={siteId} current="products" storeUrl={storeUrl} modules={site.modules} />
      <main id="main" className="container" style={{ paddingBlock: '28px 64px', maxWidth: 900 }}>
        <div className="row row--between row--wrap" style={{ marginBottom: 18 }}>
          <div>
            <h1 style={{ fontSize: 24, margin: 0 }}>Products</h1>
            <p className="secondary" style={{ margin: '4px 0 0', fontSize: 14 }}>
              {products.length} of {limit.toLocaleString('en-NG')} on your plan
            </p>
          </div>
          <a className="btn btn--primary" href={`/dashboard/${siteId}/products/new`}>
            + Add product
          </a>
        </div>

        {typeof saved === 'string' && saved ? (
          <div className="alert alert--good" role="status" style={{ marginBottom: 16 }}>
            <span className="alert__icon" aria-hidden="true">✓</span>
            <span>Saved “{saved.slice(0, 120)}”.</span>
          </div>
        ) : null}

        {suggestMrMouse ? <MrMousePromo siteId={siteId} variant="tip" /> : null}

        {!storeOn ? (
          <div className="alert alert--warning" style={{ marginBottom: 16 }}>
            <span className="alert__icon" aria-hidden="true">!</span>
            <span>Your site’s shop is switched off, so products here are not shown to visitors.</span>
          </div>
        ) : null}

        {products.length === 0 ? (
          <div className="card empty">
            <p style={{ margin: '0 0 12px' }}>
              <strong>No products yet.</strong> Add your first one — a name and a price is enough to start selling.
            </p>
            <a className="btn btn--primary" href={`/dashboard/${siteId}/products/new`}>
              Add your first product
            </a>
          </div>
        ) : (
          <ul className="product-list">
            {products.map((product) => {
              const lowStock = product.trackInventory && product.quantity <= 3;
              return (
                <li key={product.id}>
                  <a className="product-row card" href={`/dashboard/${siteId}/products/${product.id}`}>
                    {product.images[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="product-row__thumb" src={product.images[0].url} alt="" loading="lazy" />
                    ) : (
                      <span className="product-row__thumb product-row__thumb--empty" aria-hidden="true">
                        {product.title.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span className="product-row__main">
                      <span className="product-row__title">{product.title}</span>
                      <span className="product-row__meta">
                        {product.status === 'active' ? (
                          <span className="badge badge--good">● In store</span>
                        ) : (
                          <span className="badge">○ Draft</span>
                        )}
                        {product.trackInventory ? (
                          <span className={`badge${lowStock ? ' badge--warning' : ''}`}>
                            {product.quantity === 0 ? '▲ Sold out' : `${lowStock ? '▲ ' : ''}${product.quantity} in stock`}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <span className="product-row__price money">{formatNaira(product.priceKobo)}</span>
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

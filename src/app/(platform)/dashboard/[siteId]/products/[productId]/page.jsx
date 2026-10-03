import { notFound } from 'next/navigation';
import { requireDashboardAccess } from '@/lib/dashboard/access';
import { withSite } from '@/lib/tenant/loadSite';
import { findProductForSeller } from '@/lib/products/products';
import { limitsFor } from '@/lib/billing/quota';
import { cloudinaryConfig } from '@/lib/products/images';
import { koboToNairaInput } from '@/lib/money/kobo';
import { siteOrigin } from '@/lib/seo/meta';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import ProductForm from '@/components/dashboard/ProductForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Edit product', robots: { index: false } };

export default async function EditProductPage({ params }) {
  const { siteId, productId } = await params;
  const { access } = await requireDashboardAccess(siteId, 'products:write');
  const site = access.site;

  // Looked up inside this store's tenant scope: another store's id is a 404.
  const product = await withSite(site, () => findProductForSeller(productId));
  if (!product) notFound();

  const storeUrl = siteOrigin(site);

  return (
    <div className="shell">
      <DashboardHeader siteId={siteId} current="products" storeUrl={storeUrl} modules={site.modules} />
      <main id="main" className="container container--narrow" style={{ paddingBlock: '28px 64px' }}>
        <p style={{ margin: '0 0 6px' }}>
          <a href={`/dashboard/${siteId}/products`}>← Products</a>
        </p>
        <div className="row row--between row--wrap" style={{ marginBottom: 18 }}>
          <h1 style={{ fontSize: 24, margin: 0 }}>{product.title}</h1>
          {product.status === 'active' ? (
            <a href={`${storeUrl}/shop/${product.slug}`} target="_blank" rel="noopener noreferrer">
              View in store ↗
            </a>
          ) : null}
        </div>
        <ProductForm
          siteId={siteId}
          product={{
            ...product,
            // Kobo → the naira string the seller types, by integer arithmetic.
            priceNaira: koboToNairaInput(product.priceKobo),
            compareAtPriceNaira: product.compareAtPriceKobo ? koboToNairaInput(product.compareAtPriceKobo) : '',
          }}
          maxImages={limitsFor(site).imagesPerProduct}
          uploadsEnabled={Boolean(cloudinaryConfig())}
        />
      </main>
    </div>
  );
}

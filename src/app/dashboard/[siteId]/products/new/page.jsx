import { requireDashboardAccess } from '@/lib/dashboard/access';
import { limitsFor } from '@/lib/billing/quota';
import { cloudinaryConfig } from '@/lib/products/images';
import { siteOrigin } from '@/lib/seo/meta';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import ProductForm from '@/components/dashboard/ProductForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Add product', robots: { index: false } };

export default async function NewProductPage({ params }) {
  const { siteId } = await params;
  const { access } = await requireDashboardAccess(siteId, 'products:write');
  const site = access.site;

  return (
    <div className="shell">
      <DashboardHeader siteId={siteId} current="products" storeUrl={siteOrigin(site)} modules={site.modules} />
      <main id="main" className="container container--narrow" style={{ paddingBlock: '28px 64px' }}>
        <p style={{ margin: '0 0 6px' }}>
          <a href={`/dashboard/${siteId}/products`}>← Products</a>
        </p>
        <h1 style={{ fontSize: 24, marginBottom: 18 }}>Add a product</h1>
        <ProductForm
          siteId={siteId}
          maxImages={limitsFor(site).imagesPerProduct}
          uploadsEnabled={Boolean(cloudinaryConfig())}
        />
      </main>
    </div>
  );
}

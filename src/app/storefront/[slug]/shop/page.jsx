import { notFound } from 'next/navigation';
import { requireStorefront } from '@/lib/tenant/storefront';
import { withSite } from '@/lib/tenant/loadSite';
import { isModuleEnabled } from '@/lib/content/modules';
import { listActiveProducts } from '@/lib/products/products';
import ProductCard from '@/components/shop/ProductCard';
import ProductArt from '@/components/art/ProductArt';

export const metadata = { title: 'Shop' };

export default async function ShopIndex({ params }) {
  const site = await requireStorefront(params);
  // A disabled module is absent, not forbidden — see lib/content/modules.ts.
  if (!isModuleEnabled(site, 'store')) notFound();

  const products = await withSite(site, () => listActiveProducts(200));

  return (
    <div className="container section-sm">
      <header className="page-head">
        <h1 className="page-head__title">Shop</h1>
        <p className="page-head__lede">
          {products.length} item{products.length === 1 ? '' : 's'} from {site.name}
        </p>
      </header>

      {products.length === 0 ? (
        <div className="store-empty">
          <ProductArt title="Gift box" seed={site.slug} label="" className="store-empty__art" />
          <div>
            <h2 className="store-empty__title">Nothing on the shelves yet</h2>
            <p className="muted">{site.name} is stocking up. Check back soon.</p>
          </div>
        </div>
      ) : (
        <div className="product-grid">
          {products.map((product, index) => (
            <ProductCard key={product.id} product={product} index={index} />
          ))}
        </div>
      )}
    </div>
  );
}

import ProductArt from '@/components/art/ProductArt';
import { formatNaira } from '@/lib/ui/format';
import StoreImage from '@/components/media/StoreImage';
import { IMAGE_SIZES } from '@/lib/media/responsiveImage';

/**
 * A product in a grid. Takes a ProductView (lib/products/products.ts).
 *
 * No photo yet → generated art rather than a grey box. A "was" price shows
 * the saving; a sold-out product stays visible but says so, because hiding
 * it makes a returning customer think the shop removed it.
 */
export default function ProductCard({ product, index = 0 }) {
  const photo = product.images?.[0];
  const saving =
    product.compareAtPriceKobo && product.compareAtPriceKobo > product.priceKobo
      ? Math.round((1 - product.priceKobo / product.compareAtPriceKobo) * 100)
      : null;

  return (
    <a className="product-card" href={`/shop/${product.slug}`} style={{ '--delay': `${Math.min(index, 8) * 50}ms` }}>
      <div className="product-card__media">
        {photo ? (
          <StoreImage image={photo} alt={photo.alt ?? product.title} sizes={IMAGE_SIZES.productCard} fallbackWidth={480} />
        ) : (
          <ProductArt title={product.title} seed={product.id} label={product.title} />
        )}
        {saving ? <span className="product-card__flag">−{saving}%</span> : null}
        {!product.inStock ? <span className="product-card__flag product-card__flag--out">Sold out</span> : null}
        <span className="product-card__peek" aria-hidden="true">
          View →
        </span>
      </div>
      <span className="product-card__title">{product.title}</span>
      <span className="product-card__price">
        <span className="money">{formatNaira(product.priceKobo)}</span>
        {saving ? <s className="money product-card__was">{formatNaira(product.compareAtPriceKobo)}</s> : null}
      </span>
    </a>
  );
}

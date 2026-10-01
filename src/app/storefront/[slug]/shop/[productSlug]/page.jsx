import { notFound } from 'next/navigation';
import { requireStorefront } from '@/lib/tenant/storefront';
import { withSite } from '@/lib/tenant/loadSite';
import { isModuleEnabled } from '@/lib/content/modules';
import { findActiveProduct } from '@/lib/products/products';
import { canonicalUrl } from '@/lib/seo/meta';
import { serializeJsonLd } from '@/lib/seo/jsonLd';
import { formatNaira } from '@/lib/ui/format';
import ProductArt from '@/components/art/ProductArt';
import AddToCart from '@/components/shop/AddToCart';

/**
 * One product.
 *
 * The price on this page is read from the database at request time. The
 * basket keeps only this product's id; checkout reads the price again.
 */

async function load(params) {
  const site = await requireStorefront(params);
  if (!isModuleEnabled(site, 'store')) notFound();
  const { productSlug } = await params;
  const product = await withSite(site, () => findActiveProduct(productSlug));
  if (!product) notFound();
  return { site, product };
}

/** Kobo to a schema.org price string, without passing through a float. */
function koboToDecimalString(kobo) {
  return `${Math.floor(kobo / 100)}.${String(kobo % 100).padStart(2, '0')}`;
}

function plainText(html, max = 160) {
  return String(html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export async function generateMetadata({ params }) {
  const { site, product } = await load(params);
  const description =
    plainText(product.descriptionHtml) || `${product.title} — ${formatNaira(product.priceKobo)} at ${site.name}.`;
  return {
    title: product.title,
    description,
    alternates: { canonical: canonicalUrl(site, `/shop/${product.slug}`) },
    openGraph: {
      title: product.title,
      description,
      images: product.images?.[0]?.url ? [product.images[0].url] : undefined,
    },
  };
}

export default async function ProductPage({ params }) {
  const { site, product } = await load(params);
  const photo = product.images?.[0];
  const saving =
    product.compareAtPriceKobo && product.compareAtPriceKobo > product.priceKobo
      ? Math.round((1 - product.priceKobo / product.compareAtPriceKobo) * 100)
      : null;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: plainText(product.descriptionHtml, 500) || undefined,
    image: photo?.url,
    sku: product.sku ?? undefined,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'NGN',
      price: koboToDecimalString(product.priceKobo),
      availability: product.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: canonicalUrl(site, `/shop/${product.slug}`),
    },
  };

  return (
    <div className="container section-sm">
      <script
        type="application/ld+json"
        // serializeJsonLd escapes < so a product title cannot close this element.
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />

      <nav aria-label="Breadcrumb" className="crumbs">
        <a href="/shop">← All products</a>
      </nav>

      <article className="product">
        <div className="product__gallery">
          <div className="product__media">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo.url} alt={photo.alt ?? product.title} />
            ) : (
              <ProductArt title={product.title} seed={product.id} label={product.title} />
            )}
          </div>
          {product.images.length > 1 ? (
            <ul className="product__thumbs">
              {product.images.slice(1, 5).map((image) => (
                <li key={image.url}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image.url} alt={image.alt ?? ''} loading="lazy" />
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="product__info">
          <h1 className="product__title">{product.title}</h1>

          <p className="product__price">
            <span className="money">{formatNaira(product.priceKobo)}</span>
            {saving ? (
              <>
                <s className="money product__was">{formatNaira(product.compareAtPriceKobo)}</s>
                <span className="badge badge--accent">Save {saving}%</span>
              </>
            ) : null}
          </p>

          <p className="product__stock">
            {product.inStock ? (
              product.trackInventory && product.quantity <= 5 ? (
                <span className="badge badge--warning">▲ Only {product.quantity} left</span>
              ) : (
                <span className="badge badge--good">● In stock</span>
              )
            ) : (
              <span className="badge badge--critical">✕ Sold out</span>
            )}
          </p>

          <AddToCart
            productId={product.id}
            title={product.title}
            inStock={product.inStock}
            maxQuantity={product.trackInventory ? product.quantity : null}
          />

          {product.descriptionHtml ? (
            <div
              className="prose product__description"
              // Sanitised at write time by sanitizeRichText; safe because of what
              // happened on the way in, not because of anything done here.
              dangerouslySetInnerHTML={{ __html: product.descriptionHtml }}
            />
          ) : null}

          <div className="product__assure">
            <div>
              <strong>Pay safely</strong>
              <span>Checkout runs through Paystack. Never pay a seller by direct transfer.</span>
            </div>
            <div>
              <strong>Questions?</strong>
              <span>
                <a href="/account/messages">Message {site.name}</a> about sizes, colours or delivery.
              </span>
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}

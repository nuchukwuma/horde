/**
 * The eight page blocks a seller can arrange with the store editor.
 *
 * Plain components — no hooks, no browser APIs — so the SAME code renders on
 * the server for customers (Puck's RSC Render) and in the editor's live
 * preview. What a seller arranges is exactly what a customer gets.
 *
 * Every value here arrived through lib/design/blocks.ts: plain-text fields
 * render as React text (escaped); the two rich-text fields were sanitised
 * with DOMPurify on save; links are internal paths; images are on our
 * Cloudinary in this store's folder. Nothing here builds a URL from free text
 * except wa.me, which takes a digits-only phone number.
 *
 * Design: without an uploaded image, a block draws art in the store's look
 * (components/design/LookArt.jsx) — adire cloth dyed from the store's name,
 * Danfo bus stripes, or a printed receipt — in the store's own colours,
 * rather than a stock gradient.
 */

import LookArt from '@/components/design/LookArt';
import ProductCard from '@/components/shop/ProductCard';

/** Rich text is a sanitised string on the server, a live editor in Puck. */
function Rich({ value, className }) {
  if (!value) return null;
  if (typeof value === 'string') {
    return <div className={className} dangerouslySetInnerHTML={{ __html: value }} />;
  }
  return <div className={className}>{value}</div>;
}

function storeName(puck) {
  return puck?.metadata?.store?.name ?? 'Your store';
}

/** The store's look (Adire, Danfo, Credit Alert), for fallback art. */
function storeLook(puck) {
  return puck?.metadata?.store?.look ?? 'adire';
}

/**
 * Text for a tile's fallback art. Adire seeds its pattern from store name +
 * label (unchanged, so existing stores keep their cloth); the other looks
 * print the label itself, which is what reads on a plate or a receipt.
 */
function artName(puck, label) {
  return storeLook(puck) === 'adire' ? `${storeName(puck)} ${label}` : label || storeName(puck);
}

export function AnnouncementBar({ text, href, tone = 'accent' }) {
  if (!text) return null;
  const inner = <span>{text}</span>;
  return (
    <div className={`blk-announce blk-announce--${tone}`}>
      {href ? (
        <a href={href} className="blk-announce__link">
          {inner}
        </a>
      ) : (
        inner
      )}
    </div>
  );
}

export function Hero({ heading, subheading, image, ctaLabel, ctaHref, align = 'left', puck }) {
  return (
    <section className={`blk-hero blk-hero--${align}${image ? ' blk-hero--image' : ` blk-hero--art-${storeLook(puck)}`}`}>
      <div className="blk-hero__media" aria-hidden={image ? undefined : true}>
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image.url} alt={image.alt ?? ''} width={image.width} height={image.height} />
        ) : (
          <LookArt look={storeLook(puck)} name={storeName(puck)} size="lg" className="blk-hero__cloth" />
        )}
      </div>
      <div className="container blk-hero__inner">
        <div className="blk-hero__panel">
          <h1 className="blk-hero__title">{heading}</h1>
          {subheading ? <p className="blk-hero__sub">{subheading}</p> : null}
          {ctaLabel ? (
            <a className="btn btn--primary btn--lg blk-btn" href={ctaHref || '/shop'}>
              {ctaLabel}
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function FeaturedProducts({ heading, count = 6, puck }) {
  const products = (puck?.metadata?.products ?? []).slice(0, Number(count) || 6);
  return (
    <section className="container blk-section">
      <div className="store-section__head">
        <h2 className="store-section__title">{heading}</h2>
        <a className="store-section__more" href="/shop">
          See everything
        </a>
      </div>
      {products.length === 0 ? (
        <p className="blk-empty">Products you add will appear here.</p>
      ) : (
        <div className="product-grid">
          {products.map((product, index) => (
            <ProductCard key={product.id} product={product} index={index} />
          ))}
        </div>
      )}
    </section>
  );
}

export function CategoryGrid({ heading, tiles = [], puck }) {
  if (tiles.length === 0) return null;
  return (
    <section className="container blk-section">
      <h2 className="store-section__title blk-heading">{heading}</h2>
      <ul className="blk-cats">
        {tiles.map((tile, index) => (
          <li key={`${tile.label}-${index}`}>
            <a className="blk-cat" href={tile.href || '/shop'}>
              <span className="blk-cat__media" aria-hidden="true">
                {tile.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={tile.image.url} alt="" loading="lazy" />
                ) : (
                  <LookArt look={storeLook(puck)} name={artName(puck, tile.label)} size="sm" className="blk-cat__cloth" />
                )}
              </span>
              <span className="blk-cat__label">{tile.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Testimonials({ heading, items = [] }) {
  if (items.length === 0) return null;
  return (
    <section className="container blk-section">
      <h2 className="store-section__title blk-heading">{heading}</h2>
      <ul className="blk-quotes">
        {items.map((item, index) => (
          <li key={`${item.name}-${index}`} className="blk-quote">
            <blockquote>
              <p>{item.quote}</p>
            </blockquote>
            <p className="blk-quote__by">
              {item.name}
              {item.location ? <span>, {item.location}</span> : null}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ImageText({ heading, body, image, imageSide = 'left', puck }) {
  return (
    <section className={`container blk-section blk-split blk-split--${imageSide}`}>
      <div className="blk-split__media">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image.url} alt={image.alt ?? ''} loading="lazy" />
        ) : (
          <LookArt look={storeLook(puck)} name={artName(puck, heading)} size="md" className="blk-split__cloth" />
        )}
      </div>
      <div className="blk-split__text">
        <h2 className="store-section__title">{heading}</h2>
        <Rich value={body} className="prose blk-rich" />
      </div>
    </section>
  );
}

export function FAQ({ heading, items = [] }) {
  if (items.length === 0) return null;
  return (
    <section className="container container--narrow blk-section">
      <h2 className="store-section__title blk-heading">{heading}</h2>
      <div className="blk-faq">
        {items.map((item, index) => (
          // Native <details>: opens and closes with no JavaScript at all.
          <details key={`${item.question}-${index}`} className="blk-faq__item">
            <summary>{item.question}</summary>
            <Rich value={item.answer} className="prose blk-rich" />
          </details>
        ))}
      </div>
    </section>
  );
}

export function ContactWhatsApp({ heading, text, phone, prefill, buttonLabel }) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  const href = digits
    ? `https://wa.me/${digits}${prefill ? `?text=${encodeURIComponent(prefill)}` : ''}`
    : null;
  return (
    <section className="container blk-section">
      <div className="blk-wa">
        <div>
          <h2 className="store-section__title">{heading}</h2>
          {text ? <p className="blk-wa__text">{text}</p> : null}
        </div>
        {href ? (
          <a className="btn btn--lg blk-wa__btn" href={href} target="_blank" rel="noopener noreferrer nofollow">
            {buttonLabel || 'Chat on WhatsApp'}
          </a>
        ) : null}
      </div>
      <p className="blk-wa__note">
        Pay through this store&rsquo;s checkout, not by direct transfer — it is the only way a
        payment can be traced and refunded.
      </p>
    </section>
  );
}

export const BLOCK_COMPONENTS = {
  AnnouncementBar,
  Hero,
  FeaturedProducts,
  CategoryGrid,
  Testimonials,
  ImageText,
  FAQ,
  ContactWhatsApp,
};

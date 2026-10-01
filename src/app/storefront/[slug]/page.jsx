import { requireStorefront } from '@/lib/tenant/storefront';
import { withSite } from '@/lib/tenant/loadSite';
import { listActiveProducts } from '@/lib/products/products';
import { listPublishedPosts } from '@/lib/content/posts';
import { listPublishedProjects } from '@/lib/content/projects';
import { formatDate } from '@/lib/ui/format';
import { buildSocialLinks } from '@/lib/content/socials';
import SocialLinks from '@/components/shop/SocialLinks';
import ProductCard from '@/components/shop/ProductCard';
import StoreMonogram from '@/components/shop/StoreMonogram';
import ProductArt from '@/components/art/ProductArt';

/**
 * Storefront home.
 *
 * Leads with the seller's own name and work, in the seller's own colour —
 * not a hero about HordeMart. The first viewport should tell a visitor what
 * this shop sells.
 */

export default async function StorefrontHome({ params }) {
  const site = await requireStorefront(params);

  const { products, posts, projects } = await withSite(site, async () => ({
    products: site.modules.store ? await listActiveProducts(8) : [],
    posts: site.modules.blog ? await listPublishedPosts({ limit: 3 }) : [],
    projects: site.modules.portfolio ? await listPublishedProjects(6) : [],
  }));

  const tagline = typeof site.settings?.tagline === 'string' ? site.settings.tagline : null;
  const isEmpty = products.length === 0 && posts.length === 0 && projects.length === 0;
  const links = buildSocialLinks(site.socials);
  const whatsapp = links.find((link) => link.platform === 'whatsapp');

  return (
    <>
      <section className="store-hero">
        <div className="container store-hero__inner">
          <div className="store-hero__copy">
            <StoreMonogram name={site.name} className="monogram monogram--xl rise-in" />
            <h1 className="store-hero__title rise-in" style={{ '--delay': '60ms' }}>
              {site.name}
            </h1>
            {tagline ? (
              <p className="store-hero__tagline rise-in" style={{ '--delay': '120ms' }}>
                {tagline}
              </p>
            ) : null}
            <div className="row row--wrap rise-in" style={{ '--delay': '180ms', marginTop: 24 }}>
              {site.modules.store ? (
                <a className="btn btn--primary btn--lg store-hero__cta" href="/shop">
                  Shop now →
                </a>
              ) : null}
              {site.modules.store ? (
                <a className="btn btn--lg store-hero__ghost" href="/account/messages">
                  Ask a question
                </a>
              ) : whatsapp ? (
                <a className="btn btn--lg store-hero__ghost" href={whatsapp.href} target="_blank" rel="noopener noreferrer nofollow">
                  Message on WhatsApp
                </a>
              ) : null}
            </div>
          </div>

          {/* A fan of the first three products: the shop's window display. */}
          {products.length > 0 ? (
            <div className="store-hero__fan" aria-hidden="true">
              {products.slice(0, 3).map((product, index) => (
                <div key={product.id} className={`fan-card fan-card--${index}`}>
                  {product.images?.[0]?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.images[0].url} alt="" />
                  ) : (
                    <ProductArt title={product.title} seed={product.id} label="" />
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {site.modules.store ? (
        <div className="trust">
          <div className="container trust__inner">
            <span>🔒 Secure checkout by Paystack</span>
            <span>💳 Card, bank transfer or USSD</span>
            <span>🧾 A receipt for every order</span>
          </div>
        </div>
      ) : null}

      {isEmpty ? (
        <section className="container section-sm">
          <div className="store-empty">
            <ProductArt title="Gift box" seed={site.slug} label="" className="store-empty__art" />
            <div>
              <h2 className="store-empty__title">Opening soon</h2>
              <p className="muted">{site.name} is stocking the shelves. Check back shortly.</p>
            </div>
          </div>
        </section>
      ) : null}

      {products.length > 0 ? (
        <section className="container section-sm">
          <div className="store-section__head">
            <h2 className="store-section__title">New in</h2>
            <a className="store-section__more" href="/shop">
              See everything →
            </a>
          </div>
          <div className="product-grid">
            {products.map((product, index) => (
              <ProductCard key={product.id} product={product} index={index} />
            ))}
          </div>
        </section>
      ) : null}

      {projects.length > 0 ? (
        <section className="container section-sm">
          <div className="store-section__head">
            <h2 className="store-section__title">Selected work</h2>
            <a className="store-section__more" href="/work">
              All work →
            </a>
          </div>
          <div className="product-grid">
            {projects.map((project) => (
              <a key={String(project._id)} className="product-card" href={`/work/${project.slug}`}>
                <div className="product-card__media">
                  {project.images?.[0]?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={project.images[0].url} alt={project.images[0].alt ?? project.title} loading="lazy" />
                  ) : (
                    <ProductArt title={project.title} seed={String(project._id)} label={project.title} />
                  )}
                </div>
                <span className="product-card__title">{project.title}</span>
                {project.client ? <span className="product-card__price">{project.client}</span> : null}
              </a>
            ))}
          </div>
        </section>
      ) : null}

      {posts.length > 0 ? (
        <section className="container section-sm">
          <div className="store-section__head">
            <h2 className="store-section__title">From the journal</h2>
            <a className="store-section__more" href="/blog">
              All posts →
            </a>
          </div>
          <ul className="post-cards">
            {posts.map((post) => (
              <li key={String(post._id)}>
                <a className="post-card" href={`/blog/${post.slug}`}>
                  <span className="post-meta">
                    {formatDate(post.publishedAt)} · {post.readingMinutes} min read
                  </span>
                  <span className="post-card__title">{post.title}</span>
                  {post.excerpt ? <span className="post-card__excerpt">{post.excerpt}</span> : null}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <SocialLinks links={links} />
    </>
  );
}

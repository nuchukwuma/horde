import { notFound } from 'next/navigation';
import { findSiteBySlug } from '@/lib/tenant/loadSite';
import { ensureDatabase } from '@/lib/http/context';
import { withSite } from '@/lib/tenant/loadSite';
import { Product } from '@/lib/db/models/Product';
import { listPublishedPosts } from '@/lib/content/posts';
import { listPublishedProjects } from '@/lib/content/projects';
import { formatNaira, formatDate } from '@/lib/ui/format';
import { buildSocialLinks } from '@/lib/content/socials';
import SocialLinks from '@/components/shop/SocialLinks';

/**
 * Storefront home.
 *
 * Leads with the seller's actual work — products, projects or writing — rather
 * than a marketing hero about the platform. The first viewport should tell a
 * visitor what this shop sells, not what HordeMart is.
 */

export const dynamic = 'force-dynamic';

export default async function StorefrontHome({ params }) {
  const { slug } = await params;
  await ensureDatabase();

  const site = await findSiteBySlug(slug);
  if (!site) notFound();

  const { products, posts, projects } = await withSite(site, async () => ({
    products: site.modules.store
      ? await Product.find({ status: 'active' }).sort({ createdAt: -1 }).limit(8).lean()
      : [],
    posts: site.modules.blog ? await listPublishedPosts({ limit: 3 }) : [],
    projects: site.modules.portfolio ? await listPublishedProjects(6) : [],
  }));

  const tagline = typeof site.settings?.tagline === 'string' ? site.settings.tagline : null;
  const isEmpty = products.length === 0 && posts.length === 0 && projects.length === 0;

  return (
    <>
      <section className="container hero">
        <h1 className="hero__title">{site.name}</h1>
        {tagline ? <p className="hero__tagline">{tagline}</p> : null}
      </section>

      {isEmpty ? (
        <section className="container">
          <div className="card empty">Nothing published yet. Check back soon.</div>
        </section>
      ) : null}

      {products.length > 0 ? (
        <section className="container" style={{ paddingBottom: 48 }}>
          <h2 className="section-title">Shop</h2>
          <div className="product-grid">
            {products.map((product) => (
              <a key={String(product._id)} className="product-card" href={`/shop/${product.slug}`}>
                <div className="product-card__media">
                  {product.images?.[0]?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.images[0].url} alt={product.images[0].alt ?? product.title} />
                  ) : (
                    <span>No image</span>
                  )}
                </div>
                <span className="product-card__title">{product.title}</span>
                <span className="product-card__price money">
                  {formatNaira(product.priceKobo)}
                </span>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      {projects.length > 0 ? (
        <section className="container" style={{ paddingBottom: 48 }}>
          <h2 className="section-title">Selected work</h2>
          <div className="product-grid">
            {projects.map((project) => (
              <a key={String(project._id)} className="product-card" href={`/work/${project.slug}`}>
                <div className="product-card__media">
                  {project.images?.[0]?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={project.images[0].url} alt={project.images[0].alt ?? project.title} />
                  ) : (
                    <span>No image</span>
                  )}
                </div>
                <span className="product-card__title">{project.title}</span>
                {project.client ? (
                  <span className="product-card__price">{project.client}</span>
                ) : null}
              </a>
            ))}
          </div>
        </section>
      ) : null}

      {posts.length > 0 ? (
        <section className="container" style={{ paddingBottom: 56 }}>
          <h2 className="section-title">From the journal</h2>
          <ul className="post-list">
            {posts.map((post) => (
              <li key={String(post._id)}>
                <a className="post-title" href={`/blog/${post.slug}`}>
                  {post.title}
                </a>
                <div className="post-meta">
                  {formatDate(post.publishedAt)} · {post.readingMinutes} min read
                </div>
                {post.excerpt ? (
                  <p style={{ color: 'var(--text-secondary)', marginTop: 6 }}>{post.excerpt}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <SocialLinks links={buildSocialLinks(site.socials)} />
    </>
  );
}

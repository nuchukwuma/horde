import { notFound } from 'next/navigation';
import { ensureDatabase } from '@/lib/http/context';
import { findSiteBySlug, withSite } from '@/lib/tenant/loadSite';
import { isModuleEnabled } from '@/lib/content/modules';
import { findPublishedPost } from '@/lib/content/posts';
import { buildPageMeta } from '@/lib/seo/meta';
import { blogPostingJsonLd, breadcrumbJsonLd, serializeJsonLd } from '@/lib/seo/jsonLd';
import { formatDate } from '@/lib/ui/format';
import StoreImage from '@/components/media/StoreImage';

export const dynamic = 'force-dynamic';

async function load(slug, postSlug) {
  await ensureDatabase();
  const site = await findSiteBySlug(slug);
  if (!site || !isModuleEnabled(site, 'blog')) return null;

  const post = await withSite(site, () => findPublishedPost(postSlug));
  return post ? { site, post } : null;
}

export async function generateMetadata({ params }) {
  const { slug, postSlug } = await params;
  const loaded = await load(slug, postSlug);
  if (!loaded) return {};

  const meta = buildPageMeta({
    site: loaded.site,
    path: `/blog/${loaded.post.slug}`,
    title: loaded.post.seo?.metaTitle || loaded.post.title,
    description: loaded.post.seo?.metaDescription,
    fallbackDescription: loaded.post.excerpt,
    noindex: loaded.post.seo?.noindex,
  });

  return {
    title: meta.title,
    description: meta.description,
    alternates: { canonical: meta.canonical },
    robots: meta.noindex ? { index: false, follow: true } : undefined,
    openGraph: {
      title: meta.title,
      description: meta.description,
      url: meta.canonical,
      type: 'article',
      images: loaded.post.coverImage?.url ? [loaded.post.coverImage.url] : undefined,
    },
  };
}

export default async function BlogPost({ params }) {
  const { slug, postSlug } = await params;
  const loaded = await load(slug, postSlug);
  if (!loaded) notFound();

  const { site, post } = loaded;
  const path = `/blog/${post.slug}`;

  const jsonLd = [
    blogPostingJsonLd({
      site,
      path,
      headline: post.title,
      description: post.excerpt,
      imageUrl: post.coverImage?.url,
      publishedAt: post.publishedAt,
      modifiedAt: post.updatedAt,
    }),
    breadcrumbJsonLd(site, [
      { name: site.name, path: '/' },
      { name: 'Journal', path: '/blog' },
      { name: post.title, path },
    ]),
  ];

  return (
    <article className="container container--narrow" style={{ paddingBlock: '48px 72px' }}>
      {jsonLd.map((data, index) => (
        <script
          key={index}
          type="application/ld+json"
          // serializeJsonLd escapes < so a post title cannot close this element.
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
        />
      ))}

      <nav aria-label="Breadcrumb" style={{ marginBottom: 20 }}>
        <a href="/blog" style={{ fontSize: 13.5, color: 'var(--text-muted)' }}>
          ← Journal
        </a>
      </nav>

      {/* One H1 per page. */}
      <h1 style={{ fontSize: 'clamp(28px, 4.5vw, 40px)' }}>{post.title}</h1>

      <div className="post-meta" style={{ marginTop: 10, marginBottom: 32 }}>
        <time dateTime={post.publishedAt ? new Date(post.publishedAt).toISOString() : ''}>
          {formatDate(post.publishedAt)}
        </time>
        {' · '}
        {post.readingMinutes} min read
      </div>

      {post.coverImage?.url ? (
        <StoreImage
          image={post.coverImage}
          sizes="(min-width: 760px) 720px, 100vw"
          priority
          fallbackWidth={800}
          className="post-cover"
        />
      ) : null}

      {/*
       * contentHtml was sanitised at write time by sanitizeRichText. This is the
       * only place seller HTML is rendered, and it is safe because of what
       * happened on the way in, not because of anything done here.
       */}
      <div className="prose" dangerouslySetInnerHTML={{ __html: post.contentHtml }} />
    </article>
  );
}

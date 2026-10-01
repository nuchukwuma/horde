import { notFound } from 'next/navigation';
import { ensureDatabase } from '@/lib/http/context';
import { findSiteBySlug, withSite } from '@/lib/tenant/loadSite';
import { isModuleEnabled } from '@/lib/content/modules';
import { listPublishedPosts } from '@/lib/content/posts';
import { formatDate } from '@/lib/ui/format';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Journal' };

export default async function BlogIndex({ params }) {
  const { slug } = await params;
  await ensureDatabase();

  const site = await findSiteBySlug(slug);
  // A disabled module is absent, not forbidden — see lib/content/modules.ts.
  if (!site || !isModuleEnabled(site, 'blog')) notFound();

  const posts = await withSite(site, () => listPublishedPosts({ limit: 50 }));

  return (
    <div className="container container--narrow" style={{ paddingBlock: '48px 64px' }}>
      <h1 style={{ fontSize: 34, marginBottom: 8 }}>Journal</h1>
      <p style={{ color: 'var(--text-secondary)', marginTop: 0, marginBottom: 36 }}>
        Writing from {site.name}.
      </p>

      {posts.length === 0 ? (
        <div className="card empty">No posts yet.</div>
      ) : (
        <ul className="post-list">
          {posts.map((post) => (
            <li key={String(post._id)}>
              <a className="post-title" href={`/blog/${post.slug}`}>
                {post.title}
              </a>
              <div className="post-meta">
                <time dateTime={post.publishedAt ? new Date(post.publishedAt).toISOString() : ''}>
                  {formatDate(post.publishedAt)}
                </time>
                {' · '}
                {post.readingMinutes} min read
              </div>
              {post.excerpt ? (
                <p style={{ color: 'var(--text-secondary)', marginTop: 8 }}>{post.excerpt}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

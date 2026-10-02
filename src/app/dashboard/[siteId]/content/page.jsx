import { requireDashboardAccess } from '@/lib/dashboard/access';
import { withSite } from '@/lib/tenant/loadSite';
import { isModuleEnabled } from '@/lib/content/modules';
import { listPostsForSeller } from '@/lib/content/posts';
import { listProjectsForSeller } from '@/lib/content/projects';
import { siteOrigin } from '@/lib/seo/meta';
import { formatDate } from '@/lib/ui/format';
import DashboardHeader from '@/components/dashboard/DashboardHeader';

/** Blog posts and portfolio projects, for sites that have either switched on. */

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Blog & work', robots: { index: false } };

export default async function ContentPage({ params, searchParams }) {
  const { siteId } = await params;
  const { tab, saved } = await searchParams;
  const { access } = await requireDashboardAccess(siteId);
  const site = access.site;
  const blogOn = isModuleEnabled(site, 'blog');
  const workOn = isModuleEnabled(site, 'portfolio');
  const current = tab === 'projects' && workOn ? 'projects' : blogOn ? 'posts' : workOn ? 'projects' : null;

  const rows = current
    ? await withSite(site, async () => (current === 'posts' ? listPostsForSeller() : listProjectsForSeller()))
    : [];

  const newHref = `/dashboard/${siteId}/content/${current}/new`;

  return (
    <div className="shell">
      <DashboardHeader siteId={siteId} current="content" storeUrl={siteOrigin(site)} modules={site.modules} />
      <main id="main" className="container" style={{ paddingBlock: '28px 64px', maxWidth: 900 }}>
        <div className="row row--between row--wrap" style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 24, margin: 0 }}>{blogOn && workOn ? 'Blog & work' : blogOn ? 'Blog' : 'Portfolio'}</h1>
          {current ? (
            <a className="btn btn--primary" href={newHref}>
              + {current === 'posts' ? 'Write a post' : 'Add a project'}
            </a>
          ) : null}
        </div>

        {typeof saved === 'string' && saved ? (
          <div className="alert alert--good" role="status" style={{ marginBottom: 16 }}>
            <span className="alert__icon" aria-hidden="true">✓</span>
            <span>Saved “{saved.slice(0, 120)}”.</span>
          </div>
        ) : null}

        {blogOn && workOn ? (
          <nav className="tabs" aria-label="Show">
            <a href={`/dashboard/${siteId}/content`} aria-current={current === 'posts' ? 'page' : undefined}>
              Blog posts
            </a>
            <a href={`/dashboard/${siteId}/content?tab=projects`} aria-current={current === 'projects' ? 'page' : undefined}>
              Portfolio
            </a>
          </nav>
        ) : null}

        {!current ? (
          <div className="card empty">Your site has no blog or portfolio switched on.</div>
        ) : rows.length === 0 ? (
          <div className="card empty">
            <p style={{ margin: '0 0 12px' }}>
              {current === 'posts' ? 'No posts yet. Tell customers how things are made, what is new, what is coming.' : 'No projects yet. Show your best work.'}
            </p>
            <a className="btn btn--primary" href={newHref}>
              {current === 'posts' ? 'Write your first post' : 'Add your first project'}
            </a>
          </div>
        ) : (
          <ul className="product-list">
            {rows.map((row) => {
              const thumb = current === 'posts' ? row.coverImage?.url : row.images?.[0]?.url;
              return (
                <li key={String(row._id)}>
                  <a className="product-row card" href={`/dashboard/${siteId}/content/${current}/${String(row._id)}`}>
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="product-row__thumb" src={thumb} alt="" loading="lazy" />
                    ) : (
                      <span className="product-row__thumb product-row__thumb--empty" aria-hidden="true">
                        {row.title.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span className="product-row__main">
                      <span className="product-row__title">{row.title}</span>
                      <span className="product-row__meta">
                        {row.status === 'published' ? (
                          <span className="badge badge--good">● Published</span>
                        ) : (
                          <span className="badge">○ Draft</span>
                        )}
                        <span className="order-row__date">
                          {row.publishedAt ? formatDate(row.publishedAt) : `Edited ${formatDate(row.updatedAt)}`}
                        </span>
                      </span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}

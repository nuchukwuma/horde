import { notFound } from 'next/navigation';
import { requireStorefront } from '@/lib/tenant/storefront';
import { withSite } from '@/lib/tenant/loadSite';
import { isModuleEnabled } from '@/lib/content/modules';
import { findPublishedProject } from '@/lib/content/projects';
import { canonicalUrl } from '@/lib/seo/meta';
import { creativeWorkJsonLd, serializeJsonLd } from '@/lib/seo/jsonLd';
import { formatDate } from '@/lib/ui/format';
import ProductArt from '@/components/art/ProductArt';

async function load(params) {
  const site = await requireStorefront(params);
  if (!isModuleEnabled(site, 'portfolio')) notFound();
  const { projectSlug } = await params;
  const project = await withSite(site, () => findPublishedProject(String(projectSlug).toLowerCase()));
  if (!project) notFound();
  return { site, project };
}

export async function generateMetadata({ params }) {
  const { site, project } = await load(params);
  return {
    title: project.seo?.metaTitle || project.title,
    description: project.seo?.metaDescription || project.summary,
    alternates: { canonical: canonicalUrl(site, `/work/${project.slug}`) },
    robots: project.seo?.noindex ? { index: false, follow: true } : undefined,
  };
}

export default async function WorkDetail({ params }) {
  const { site, project } = await load(params);
  const [cover, ...rest] = project.images ?? [];

  return (
    <article className="container container--narrow section-sm">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            creativeWorkJsonLd({
              site,
              path: `/work/${project.slug}`,
              name: project.title,
              description: project.summary,
              imageUrl: cover?.url,
              completedAt: project.completedAt ? new Date(project.completedAt) : null,
            }),
          ),
        }}
      />

      <nav aria-label="Breadcrumb" className="crumbs">
        <a href="/work">← All work</a>
      </nav>

      <h1 className="page-head__title">{project.title}</h1>
      <p className="post-meta" style={{ marginBottom: 24 }}>
        {[project.client, project.role, project.completedAt ? formatDate(project.completedAt) : null]
          .filter(Boolean)
          .join(' · ')}
      </p>

      <div className="product__media" style={{ aspectRatio: '16 / 10', marginBottom: 28 }}>
        {cover?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover.url} alt={cover.alt ?? project.title} />
        ) : (
          <ProductArt title={project.title} seed={String(project._id)} label={project.title} />
        )}
      </div>

      {project.summary ? <p className="page-head__lede" style={{ fontSize: 18 }}>{project.summary}</p> : null}

      {project.descriptionHtml ? (
        // Sanitised at write time by sanitizeRichText.
        <div className="prose" style={{ marginTop: 20 }} dangerouslySetInnerHTML={{ __html: project.descriptionHtml }} />
      ) : null}

      {rest.length > 0 ? (
        <div className="product-grid" style={{ marginTop: 28 }}>
          {rest.map((image) => (
            <div key={image.url} className="product-card__media">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.url} alt={image.alt ?? ''} loading="lazy" />
            </div>
          ))}
        </div>
      ) : null}

      {project.projectUrl ? (
        <p style={{ marginTop: 24 }}>
          <a className="btn btn--primary" href={project.projectUrl} target="_blank" rel="noopener noreferrer nofollow">
            See the project ↗
          </a>
        </p>
      ) : null}
    </article>
  );
}

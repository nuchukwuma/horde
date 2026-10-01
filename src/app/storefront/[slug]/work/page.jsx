import { notFound } from 'next/navigation';
import { requireStorefront } from '@/lib/tenant/storefront';
import { withSite } from '@/lib/tenant/loadSite';
import { isModuleEnabled } from '@/lib/content/modules';
import { listPublishedProjects } from '@/lib/content/projects';
import ProductArt from '@/components/art/ProductArt';

export const metadata = { title: 'Work' };

/** Portfolio index. The storefront nav has linked here since the start; it 404'd. */
export default async function WorkIndex({ params }) {
  const site = await requireStorefront(params);
  if (!isModuleEnabled(site, 'portfolio')) notFound();

  const projects = await withSite(site, () => listPublishedProjects(100));

  return (
    <div className="container section-sm">
      <header className="page-head">
        <h1 className="page-head__title">Work</h1>
        <p className="page-head__lede">Selected projects by {site.name}.</p>
      </header>

      {projects.length === 0 ? (
        <div className="card empty">Nothing here yet.</div>
      ) : (
        <div className="product-grid">
          {projects.map((project, index) => (
            <a key={String(project._id)} className="product-card" href={`/work/${project.slug}`} style={{ '--delay': `${Math.min(index, 8) * 50}ms` }}>
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
      )}
    </div>
  );
}

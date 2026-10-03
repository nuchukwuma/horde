import { notFound } from 'next/navigation';
import { requireDashboardAccess } from '@/lib/dashboard/access';
import { isModuleEnabled } from '@/lib/content/modules';
import { withSite } from '@/lib/tenant/loadSite';
import { findProjectForSeller } from '@/lib/content/projects';
import { toProjectEditorView } from '@/lib/content/views';
import { cloudinaryConfig } from '@/lib/products/images';
import { siteOrigin } from '@/lib/seo/meta';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import ContentForm from '@/components/dashboard/ContentForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Edit project', robots: { index: false } };

export default async function EditPage({ params }) {
  const { siteId, projectId } = await params;
  const { access } = await requireDashboardAccess(siteId, 'content:write');
  const site = access.site;
  if (!isModuleEnabled(site, 'portfolio')) notFound();

  // Inside this store's tenant scope: another store's id is a 404.
  const found = await withSite(site, () => findProjectForSeller(projectId));
  if (!found) notFound();
  const item = toProjectEditorView(found);

  return (
    <div className="shell">
      <DashboardHeader siteId={siteId} current="content" storeUrl={siteOrigin(site)} modules={site.modules} />
      <main id="main" className="container container--narrow" style={{ paddingBlock: '28px 64px' }}>
        <p style={{ margin: '0 0 6px' }}>
          <a href={`/dashboard/${siteId}/content?tab=projects`}>← Back</a>
        </p>
        <h1 style={{ fontSize: 24, marginBottom: 18 }}>{item.title}</h1>
        <ContentForm siteId={siteId} kind="project" item={item} uploadsEnabled={Boolean(cloudinaryConfig())} storeUrl={siteOrigin(site)} />
      </main>
    </div>
  );
}

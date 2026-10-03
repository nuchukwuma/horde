import { requireDashboardAccess } from '@/lib/dashboard/access';
import { withSite } from '@/lib/tenant/loadSite';
import { loadEditorDesign } from '@/lib/design/service';
import { listActiveProducts } from '@/lib/products/products';
import { siteOrigin } from '@/lib/seo/meta';
import DesignEditor from '@/components/editor/DesignEditor';

/**
 * Store design editor. Lives under /dashboard on the app host, behind seller
 * sign-in. A store's own address cannot serve it: every tenant-host request
 * is rewritten into the storefront tree, which has no such route, and the
 * platform session cookie is host-only to the app host anyway.
 */

export const metadata = { title: 'Store design', robots: { index: false } };

export default async function DesignPage({ params }) {
  const { siteId } = await params;
  const { access } = await requireDashboardAccess(siteId, 'settings:write');
  const site = access.site;

  const { design, products } = await withSite(site, async () => ({
    design: await loadEditorDesign(site),
    products: site.modules.store ? await listActiveProducts(9) : [],
  }));

  return (
    <DesignEditor
      siteId={String(site._id)}
      storeName={site.name}
      storeUrl={siteOrigin(site)}
      products={products}
      initial={JSON.parse(JSON.stringify(design))}
      initialSocials={JSON.parse(JSON.stringify(site.socials ?? {}))}
    />
  );
}

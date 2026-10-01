import { requireDashboardAccess } from '@/lib/dashboard/access';
import { siteOrigin } from '@/lib/seo/meta';
import AddressForm from '@/components/dashboard/AddressForm';
import DashboardHeader from '@/components/dashboard/DashboardHeader';

export const metadata = { title: 'Store address', robots: { index: false } };

export default async function AddressPage({ params }) {
  const { siteId } = await params;
  const { access } = await requireDashboardAccess(siteId);
  const site = access.site;
  const rootDomain = process.env.ROOT_DOMAIN ?? 'hordemart.com';
  const isOwner = access.role === 'owner' || access.role === 'platform_admin';

  return (
    <div className="shell">
      <DashboardHeader siteId={siteId} current="address" storeUrl={siteOrigin(site)} />
      <main className="container container--narrow" style={{ paddingBlock: '40px 64px' }}>
        <h1 style={{ fontSize: 28, marginBottom: 8 }}>Store address</h1>
        <p className="secondary" style={{ marginTop: 0 }}>
          Your store is at{' '}
          <a href={siteOrigin(site)}>
            <strong>
              {site.slug}.{rootDomain}
            </strong>
          </a>
          .
        </p>

        <div className="alert alert--warning" style={{ margin: '18px 0' }}>
          <span className="alert__icon" aria-hidden="true">!</span>
          <span>
            Changing it keeps your old address working as a redirect, and nobody else can ever take
            it. Customers who are signed in to your store will need to sign in again. You can change
            your address three times in 30 days.
          </span>
        </div>

        {isOwner ? (
          <AddressForm siteId={siteId} currentSlug={site.slug} rootDomain={rootDomain} />
        ) : (
          <p className="card">Only the store owner can change its address.</p>
        )}

        <section className="card" style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: 18, marginBottom: 6 }}>
            Your own domain <span className="badge">Coming soon</span>
          </h2>
          <p className="secondary" style={{ margin: 0 }}>
            Connecting an address like <strong>www.yourshop.com.ng</strong> automatically is not
            available yet. It can be set up by hand as an add-on —{' '}
            <a href={`/dashboard/${siteId}/billing`}>see Plan and billing</a>.
          </p>
        </section>
      </main>
    </div>
  );
}

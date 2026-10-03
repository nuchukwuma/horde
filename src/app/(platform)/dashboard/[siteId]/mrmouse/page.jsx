import { requireDashboardAccess } from '@/lib/dashboard/access';
import { Membership } from '@/lib/db/models/Membership';
import { siteOrigin } from '@/lib/seo/meta';
import { canLaunch, canSync, mrmouseConfig } from '@/lib/integrations/mrmouse';
import { mrmouseState } from '@/lib/integrations/mrmouseService';
import { mrmouseSaleBacklog } from '@/lib/integrations/mrmouseSales';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import MrMouseCard from '@/components/dashboard/MrMouseCard';

/**
 * MrMouse, the inventory app, from inside the store's dashboard. A separate
 * product with its own subscription: HordeMart links to it and, if the owner
 * agrees, shares just enough to sign them in and keep stock in step.
 */

export const dynamic = 'force-dynamic';
export const metadata = { title: 'MrMouse', robots: { index: false } };

export default async function MrMousePage({ params }) {
  const { siteId } = await params;
  const { session, access } = await requireDashboardAccess(siteId, 'products:read');
  const site = access.site;
  const config = mrmouseConfig();
  // The real owner decides what is shared — the same rule the API applies.
  const isOwner = Boolean(await Membership.exists({ userId: session.user._id, siteId: site._id, role: 'owner' }));
  const backlog = isOwner && canSync(config) ? await mrmouseSaleBacklog(site._id) : null;

  return (
    <div className="shell">
      <DashboardHeader siteId={siteId} current="mrmouse" storeUrl={siteOrigin(site)} modules={site.modules} />
      <main id="main" className="container container--narrow" style={{ paddingBlock: '28px 64px' }}>
        <h1 style={{ fontSize: 24, marginBottom: 6 }}>MrMouse</h1>
        <p className="secondary" style={{ marginTop: 0, marginBottom: 18 }}>
          Inventory and more for your shop, on your phone or in your browser. MrMouse is a separate app with its own
          account and subscription — it works alongside your HordeMart store.
        </p>
        {!mrmouseState(site).connected ? (
          <ul className="mm-why" aria-label="What MrMouse does for your shop">
            <li>
              <strong>Stock that stays right</strong>
              <span>Store sales come off your MrMouse stock automatically, and in-person or WhatsApp sales come off here.</span>
            </li>
            <li>
              <strong>Your books, done as you go</strong>
              <span>Money in, money out, profit and invoices — without a bookkeeper.</span>
            </li>
            <li>
              <strong>Made for Nigerian network</strong>
              <span>Record offline on your phone; it syncs when you’re back online.</span>
            </li>
          </ul>
        ) : null}
        <MrMouseCard
          siteId={siteId}
          isOwner={isOwner}
          initial={{ ...mrmouseState(site), connectedAt: undefined }}
          initialBacklog={backlog}
          launchAvailable={canLaunch(config)}
          syncAvailable={canSync(config)}
          androidUrl={config.androidUrl}
          iosUrl={config.iosUrl}
          emailVerified={Boolean(session.user.emailVerifiedAt)}
        />
      </main>
    </div>
  );
}

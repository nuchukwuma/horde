import { notFound, redirect } from 'next/navigation';
import { redirectIfTermsOutdated } from '@/lib/legal/termsGate';
import { cookies } from 'next/headers';
import { ensureDatabase } from '@/lib/http/context';
import { validateSessionToken } from '@/lib/auth/session';
import { sessionCookieName } from '@/lib/auth/cookies';
import { requireSiteAccess } from '@/lib/auth/guards';
import { withSite } from '@/lib/tenant/loadSite';
import { dashboardSummary, listTransactions } from '@/lib/dashboard/seller';
import { dailyRevenue } from '@/lib/dashboard/series';
import RevenueChart from '@/components/charts/RevenueChart';
import { formatNaira, formatDateTime } from '@/lib/ui/format';
import { siteOrigin } from '@/lib/seo/meta';
import StoreLink from '@/components/dashboard/StoreLink';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import { Product } from '@/lib/db/models/Product';
import { countOrdersToSend } from '@/lib/orders/sellerOrders';
import { getPublishedDesign } from '@/lib/design/published';
import SiteSections from '@/components/dashboard/SiteSections';
import { Membership } from '@/lib/db/models/Membership';

/**
 * Seller dashboard.
 *
 * Dense and quiet by design. A seller opens this daily to check one thing —
 * what they earned — so the hero figure is their net, everything else is
 * supporting, and nothing animates or demands attention.
 *
 * Gated by the same guards the API routes use: a visitor without a session, or
 * with a session for a different seller, gets a redirect rather than someone
 * else's revenue.
 */

export const dynamic = 'force-dynamic';

const STATUS_TONE = {
  paid: 'badge--good',
  settled: 'badge--good',
  pending: 'badge--warning',
  failed: 'badge--critical',
  reversed: 'badge--critical',
};

export default async function DashboardPage({ params }) {
  const { siteId } = await params;
  await ensureDatabase();

  const token = (await cookies()).get(sessionCookieName('platform'))?.value;
  const session = await validateSessionToken(token, 'platform');
  if (!session) redirect('/login');
  redirectIfTermsOutdated(session.user, `/dashboard/${siteId}`);

  // Throws Forbidden if this user has no membership on this site, so one seller
  // cannot read another's revenue by editing the URL.
  let site;
  try {
    ({ site } = await requireSiteAccess(session, siteId, ['owner', 'staff']));
  } catch {
    notFound();
  }
  if (!site) notFound();

  const { summary, page, series, productCount, toSend } = await withSite(site, async () => ({
    summary: await dashboardSummary(),
    page: await listTransactions({ limit: 12 }),
    series: await dailyRevenue(30),
    productCount: site.modules.store ? await Product.countDocuments({ status: 'active' }) : 0,
    toSend: site.modules.store ? await countOrdersToSend() : 0,
  }));
  const designed = Boolean(await getPublishedDesign(String(site._id), site.slug));

  // What a new seller still has to do before their first sale. Shown until
  // every step is done, then never again.
  const steps = [
    { done: Boolean(session.user.emailVerifiedAt), label: 'Confirm your email address', href: `/dashboard/${siteId}/payouts` },
    { done: site.payout?.status === 'verified', label: 'Add the bank account you want to be paid into', href: `/dashboard/${siteId}/payouts` },
    ...(site.modules.store
      ? [{ done: productCount > 0, label: 'Add your first product', href: `/dashboard/${siteId}/products/new` }]
      : []),
    { done: designed, label: 'Make your site look like yours, then publish it', href: `/dashboard/${siteId}/design` },
  ];
  const remaining = steps.filter((step) => !step.done).length;

  const gate = site.canAcceptPayments();

  // One source for the public address. The nav link previously hardcoded
  // https:// and re-derived the host, which pointed at a dead URL in dev and
  // ignored a custom domain entirely.
  const storeUrl = siteOrigin(site);

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <DashboardHeader siteId={siteId} current="overview" storeUrl={storeUrl} modules={site.modules} />

      <main id="main" className="container" style={{ paddingBlock: '28px 64px' }}>
        <div className="row row--between" style={{ marginBottom: 20, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 22 }}>{site.name}</h1>
            <p style={{ color: 'var(--text-muted)', margin: '2px 0 0', fontSize: 13.5 }}>
              {site.slug}.{process.env.ROOT_DOMAIN ?? 'hordemart.local'}
            </p>
          </div>

          {/* Status carries a glyph and a word, never colour alone. */}
          {gate.allowed ? (
            <span className="badge badge--good">● Accepting payments</span>
          ) : (
            <span className="badge badge--warning">▲ {humanise(gate.reason)}</span>
          )}
        </div>

        <div style={{ marginBottom: 20 }}>
          <StoreLink url={storeUrl} />
        </div>

        {remaining > 0 ? (
          <section className="card setup" style={{ marginBottom: 20 }} aria-labelledby="setup-title">
            <h2 id="setup-title" style={{ fontSize: 17, margin: '0 0 4px' }}>
              Get ready to sell
            </h2>
            <p className="secondary" style={{ margin: '0 0 12px', fontSize: 14 }}>
              {steps.length - remaining} of {steps.length} done.
            </p>
            <ol className="setup__steps">
              {steps.map((step) => (
                <li key={step.label} className={step.done ? 'setup__step setup__step--done' : 'setup__step'}>
                  <span className="setup__mark" aria-hidden="true">
                    {step.done ? '✓' : ''}
                  </span>
                  {step.done ? (
                    <span>
                      {step.label} <span className="visually-hidden">(done)</span>
                    </span>
                  ) : (
                    <a href={step.href}>{step.label}</a>
                  )}
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {toSend > 0 ? (
          <a className="alert alert--info to-send" href={`/dashboard/${siteId}/orders`} style={{ marginBottom: 20 }}>
            <span className="alert__icon" aria-hidden="true">▲</span>
            <span>
              <strong>
                {toSend} paid order{toSend === 1 ? '' : 's'} to send.
              </strong>{' '}
              See who bought what and where it goes →
            </span>
          </a>
        ) : null}

        {!gate.allowed ? (
          <div className="card" style={{ marginBottom: 20, borderColor: 'var(--warning)' }}>
            <strong>This store cannot take payments yet.</strong>
            <p style={{ color: 'var(--text-secondary)', margin: '6px 0 0', fontSize: 14 }}>
              {explain(gate.reason)}
            </p>
            {['payout_not_verified', 'no_subaccount'].includes(gate.reason) ? (
              <a className="btn btn--primary btn--sm" href={`/dashboard/${siteId}/payouts`} style={{ marginTop: 12 }}>
                Add bank details
              </a>
            ) : null}
          </div>
        ) : null}

        {/* The one number the dashboard leads with. */}
        <section className="card" style={{ marginBottom: 16 }}>
          <div className="stat__label">Your net, all time</div>
          <div className="hero-figure money">{formatNaira(summary.sellerNetKobo)}</div>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '6px 0 0' }}>
            After platform fees and Paystack charges, across {summary.orderCount} sale
            {summary.orderCount === 1 ? '' : 's'}.
          </p>
        </section>

        <section className="kpi-row" style={{ marginBottom: 16 }}>
          <StatTile label="Gross sales" value={formatNaira(summary.grossKobo)} />
          <StatTile
            label="Platform fees"
            value={formatNaira(summary.platformCommissionKobo)}
            hint="What HordeMart charged"
          />
          <StatTile
            label="Awaiting settlement"
            value={formatNaira(summary.pendingKobo)}
            hint={summary.settlementDataIsProvisional ? 'Provisional — see note' : undefined}
          />
          <StatTile
            label="Refunds"
            value={String(summary.refundCount)}
            hint={summary.disputedOrderCount > 0 ? `${summary.disputedOrderCount} disputed` : 'None disputed'}
          />
        </section>

        <div style={{ marginBottom: 16 }}>
          <RevenueChart
            points={series}
            title="Last 30 days"
            subtitle="Gross sales against what you keep"
          />
        </div>

        {summary.settlementDataIsProvisional ? (
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 24 }}>
            Settlement timing is reported by Paystack and is still being verified for split
            payouts. Treat “awaiting settlement” as indicative.
          </p>
        ) : null}

        <section>
          <div className="row row--between" style={{ marginBottom: 12 }}>
            <h2 className="section-title" style={{ margin: 0 }}>
              Recent transactions
            </h2>
            <a className="btn btn--quiet" href={`/api/sites/${siteId}/transactions/export`}>
              Export CSV
            </a>
          </div>

          {page.rows.length === 0 ? (
            <div className="card empty">No transactions yet.</div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <caption className="visually-hidden">
                  Recent ledger entries for {site.name}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Type</th>
                    <th scope="col">Order</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="num">
                      Gross
                    </th>
                    <th scope="col" className="num">
                      Fee
                    </th>
                    <th scope="col" className="num">
                      Your net
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {page.rows.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDateTime(row.createdAt)}</td>
                      <td>{row.entryType}</td>
                      <td>{row.orderNumber ?? '—'}</td>
                      <td>
                        <span className={`badge ${STATUS_TONE[row.status] ?? ''}`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="num money">{formatNaira(row.grossKobo)}</td>
                      <td className="num money">{formatNaira(row.platformCommissionKobo)}</td>
                      <td
                        className={`num money ${row.sellerNetKobo < 0 ? 'money--negative' : ''}`}
                      >
                        {formatNaira(row.sellerNetKobo)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        {(await Membership.exists({ userId: session.user._id, siteId: site._id, role: 'owner' })) ? (
          <SiteSections siteId={siteId} initial={{ blog: site.modules.blog, portfolio: site.modules.portfolio }} />
        ) : null}
      </main>
    </div>
  );
}

function StatTile({ label, value, hint }) {
  return (
    <div className="stat">
      <div className="stat__label">{label}</div>
      <div className="stat__value money">{value}</div>
      {hint ? <div className="stat__hint">{hint}</div> : null}
    </div>
  );
}

function humanise(reason) {
  return (
    {
      payout_not_verified: 'Payout not verified',
      no_subaccount: 'Payout not verified',
      new_seller_hold: 'New seller hold',
      site_not_active: 'Site suspended',
      prohibited_products_flagged: 'Under review',
    }[reason] ?? 'Not accepting payments'
  );
}

function explain(reason) {
  return (
    {
      payout_not_verified:
        'Add your bank details and verify them so Paystack can settle your share directly.',
      no_subaccount:
        'Your payout details are saved but no Paystack subaccount exists yet. Re-submit them to finish setup.',
      new_seller_hold:
        'New stores wait a short period before taking their first payment. Nothing is held — the store simply cannot check out yet.',
      site_not_active: 'This site is suspended. Contact support.',
      prohibited_products_flagged:
        'This store is flagged for review against the prohibited-products policy.',
    }[reason] ?? 'Finish setting up your store to start taking payments.'
  );
}

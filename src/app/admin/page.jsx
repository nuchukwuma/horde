import { cookies } from 'next/headers';
import { redirectIfTermsOutdated } from '@/lib/legal/termsGate';
import { notFound, redirect } from 'next/navigation';
import { connectToDatabase } from '@/lib/db/connect';
import { validateSessionToken } from '@/lib/auth/session';
import { sessionCookieName } from '@/lib/auth/cookies';
import { adminOverview, flaggedTransactions, storesWithVolume } from '@/lib/dashboard/admin';
import { siteOrigin } from '@/lib/seo/meta';
import { formatDateTime, formatNaira } from '@/lib/ui/format';
import SignOutButton from '@/components/auth/SignOutButton';
import SiteModeration from '@/components/admin/SiteModeration';

/**
 * The platform admin panel: totals, every store with what it has sold, and
 * the things a human should look at. Anyone who is not a platform admin gets
 * a 404 — the page does not admit it exists.
 *
 * Admins are made with `npm run make-admin -- email`, never from the web.
 */

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin | HordeMart', robots: { index: false } };

const FLAG_LABEL = {
  amount_mismatch: 'Amount mismatch',
  failed_webhook: 'Webhook failed',
  stuck_pending: 'Unconfirmed checkout',
  open_dispute: 'Open dispute',
  prohibited_products: 'Prohibited products',
};

export default async function AdminPage() {
  await connectToDatabase();
  const token = (await cookies()).get(sessionCookieName('platform'))?.value;
  const session = await validateSessionToken(token, 'platform');
  if (!session) redirect('/login');
  redirectIfTermsOutdated(session.user, '/admin');
  if (session.user.platformRole !== 'admin') notFound();

  const [overview, sellers, flagged] = await Promise.all([
    adminOverview({}),
    storesWithVolume(300),
    flaggedTransactions({ limit: 100 }),
  ]);
  const names = new Map(sellers.map((row) => [row.siteId, row]));
  const high = flagged.filter((item) => item.severity === 'high');

  return (
    <div className="shell">
      <header className="masthead dash-head">
        <div className="container masthead__inner dash-head__inner">
          <a className="brand" href="/admin">
            HordeMart <span className="badge badge--accent">Admin</span>
          </a>
          <nav className="nav dash-nav" aria-label="Admin">
            <a href="#sellers">Stores</a>
            <a href="#flagged">Needs a look{flagged.length ? ` (${flagged.length})` : ''}</a>
            <a href="/dashboard">My dashboard</a>
          </nav>
          <SignOutButton endpoint="/api/auth/logout" redirectTo="/login" />
        </div>
      </header>

      <main id="main" className="container" style={{ paddingBlock: '28px 64px' }}>
        <h1 style={{ fontSize: 24, marginBottom: 16 }}>Platform</h1>

        <section className="kpi-row" style={{ marginBottom: 16 }}>
          <Stat label="Sales through HordeMart" value={formatNaira(overview.grossKobo)} />
          <Stat label="Platform fees earned" value={formatNaira(overview.platformCommissionKobo)} />
          <Stat label="Stores" value={`${overview.activeSites} active`} hint={`${overview.suspendedSites} suspended`} />
          <Stat
            label="Awaiting bank details"
            value={String(overview.sitesAwaitingPayoutVerification)}
            hint={`${overview.flaggedSites} flagged · ${overview.openDisputes} disputes`}
          />
        </section>

        {high.length > 0 ? (
          <div className="alert alert--error" style={{ marginBottom: 16 }}>
            <span className="alert__icon" aria-hidden="true">!</span>
            <span>
              {high.length} item{high.length === 1 ? '' : 's'} where money may be wrong or missing. <a href="#flagged">Review</a>
            </span>
          </div>
        ) : null}

        <h2 id="sellers" className="section-title">
          Stores
        </h2>
        {sellers.length === 0 ? (
          <div className="card empty">No stores yet.</div>
        ) : (
          <div className="table-wrap" style={{ marginBottom: 28 }}>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Store</th>
                  <th scope="col">Plan</th>
                  <th scope="col">Payouts</th>
                  <th scope="col" className="num">
                    Sales
                  </th>
                  <th scope="col" className="num">
                    Gross
                  </th>
                  <th scope="col" className="num">
                    Our fees
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sellers.map((row) => (
                  <tr key={row.siteId}>
                    <td>
                      <a href={siteOrigin({ slug: row.slug })} target="_blank" rel="noopener noreferrer">
                        {row.name}
                      </a>
                      <div className="hint" style={{ margin: 0 }}>
                        {row.slug}
                        {row.ownerEmail ? (
                          <>
                            {' · '}
                            <a href={`mailto:${row.ownerEmail}`}>{row.ownerEmail}</a>
                          </>
                        ) : null}
                      </div>
                    </td>
                    <td>{row.planCode}</td>
                    <td>
                      <span className={`badge ${row.payoutStatus === 'verified' ? 'badge--good' : 'badge--warning'}`}>
                        {row.payoutStatus}
                      </span>
                    </td>
                    <td className="num">{row.saleCount}</td>
                    <td className="num money">{formatNaira(row.grossKobo)}</td>
                    <td className="num money">{formatNaira(row.platformCommissionKobo)}</td>
                    <td>
                      <span className={`badge ${row.status === 'active' ? 'badge--good' : 'badge--critical'}`}>{row.status}</span>
                      {row.prohibitedProductFlag ? <span className="badge badge--critical">flagged</span> : null}
                    </td>
                    <td>
                      <SiteModeration
                        siteId={row.siteId}
                        siteName={row.name}
                        status={row.status}
                        flagged={row.prohibitedProductFlag}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h2 id="flagged" className="section-title">
          Needs a look
        </h2>
        {flagged.length === 0 ? (
          <div className="card empty">Nothing flagged.</div>
        ) : (
          <ul className="product-list">
            {flagged.map((item, index) => (
              <li key={`${item.reason}-${item.orderId ?? item.siteId}-${index}`} className="card admin-flag">
                <div className="row row--wrap" style={{ gap: 8 }}>
                  <span className={`badge ${item.severity === 'high' ? 'badge--critical' : 'badge--warning'}`}>
                    {item.severity === 'high' ? '▲' : '●'} {FLAG_LABEL[item.reason] ?? item.reason}
                  </span>
                  <strong>{item.siteId ? (names.get(item.siteId)?.name ?? item.siteId) : 'Unknown store'}</strong>
                  <span className="order-row__date">{formatDateTime(item.detectedAt)}</span>
                </div>
                <p style={{ margin: '8px 0 0', fontSize: 14 }}>{item.detail}</p>
                {item.reference ? (
                  <p className="hint" style={{ margin: '4px 0 0' }}>
                    Paystack reference <code>{item.reference}</code>
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value, hint }) {
  return (
    <div className="stat">
      <div className="stat__label">{label}</div>
      <div className="stat__value money">{value}</div>
      {hint ? <div className="stat__hint">{hint}</div> : null}
    </div>
  );
}

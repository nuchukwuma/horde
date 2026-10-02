import { requireDashboardAccess } from '@/lib/dashboard/access';
import { Membership } from '@/lib/db/models/Membership';
import { isEmailVerified } from '@/lib/auth/emailVerification';
import { siteOrigin } from '@/lib/seo/meta';
import { formatDate } from '@/lib/ui/format';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import PayoutForm from '@/components/dashboard/PayoutForm';
import ResendVerification from '@/components/dashboard/ResendVerification';

/**
 * Where the store's money goes.
 *
 * Paystack splits each payment at the moment it is made and settles the
 * seller's share straight to this account; HordeMart never holds it. Only the
 * owner may change it — staff see the status but no form.
 */

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Payouts', robots: { index: false } };

export default async function PayoutsPage({ params }) {
  const { siteId } = await params;
  const { session, access } = await requireDashboardAccess(siteId);
  const site = access.site;
  const payout = site.payout ?? {};
  const verified = payout.status === 'verified';
  // The real owner only — the same rule the payout API applies, platform
  // admins included (lib/auth/guards.ts requireOwnerMembership).
  const isOwner = Boolean(await Membership.exists({ userId: session.user._id, siteId: site._id, role: 'owner' }));
  const gate = site.canAcceptPayments();

  return (
    <div className="shell">
      <DashboardHeader siteId={siteId} current="payouts" storeUrl={siteOrigin(site)} modules={site.modules} />
      <main id="main" className="container container--narrow" style={{ paddingBlock: '28px 64px' }}>
        <h1 style={{ fontSize: 24, marginBottom: 6 }}>Payouts</h1>
        <p className="secondary" style={{ marginTop: 0 }}>
          When a customer pays, Paystack sends your share straight to your bank account. HordeMart never holds
          your money.
        </p>

        <section className="card" style={{ margin: '18px 0' }}>
          <h2 style={{ fontSize: 16, margin: '0 0 10px' }}>Your payout account</h2>
          {verified ? (
            <dl className="payout-summary">
              <div>
                <dt>Account name</dt>
                <dd>{payout.resolvedAccountName}</dd>
              </div>
              <div>
                <dt>Account</dt>
                <dd>ending {payout.accountNumberLast4}</dd>
              </div>
              <div>
                <dt>Business name</dt>
                <dd>{payout.businessName}</dd>
              </div>
              <div>
                <dt>Connected</dt>
                <dd>{payout.verifiedAt ? formatDate(payout.verifiedAt) : '—'}</dd>
              </div>
            </dl>
          ) : (
            <p style={{ margin: 0 }}>
              <span className="badge badge--warning">▲ Not connected</span>{' '}
              <span className="secondary">Your store cannot take payments until you add a bank account.</span>
            </p>
          )}
          {verified && !gate.allowed && gate.reason === 'new_seller_hold' && site.checkoutEnabledFrom ? (
            <p className="hint">New stores start taking payments on {formatDate(site.checkoutEnabledFrom)}.</p>
          ) : null}
        </section>

        {!isOwner ? (
          <p className="card">Only the store owner can add or change the payout account.</p>
        ) : !isEmailVerified(session.user) ? (
          <div className="alert alert--warning">
            <span className="alert__icon" aria-hidden="true">!</span>
            <span>
              Confirm your email address first — we sent you a link when you signed up. <ResendVerification />
            </span>
          </div>
        ) : (
          <>
            <h2 style={{ fontSize: 18, margin: '24px 0 10px' }}>{verified ? 'Change account' : 'Add your bank account'}</h2>
            <PayoutForm siteId={siteId} current={{ businessName: payout.businessName ?? null }} defaultBusinessName={site.name} />
          </>
        )}
      </main>
    </div>
  );
}

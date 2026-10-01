import { requireDashboardAccess } from '@/lib/dashboard/access';
import { withSite } from '@/lib/tenant/loadSite';
import { usageFor } from '@/lib/billing/quota';
import { confirmPremiumPayment, isSubscriptionReference, premiumPlanCode } from '@/lib/billing/subscription';
import { enforceRateLimit } from '@/lib/ratelimit';
import { ADDONS, TIERS, TIERS_ARE_PLACEHOLDERS, salesContactEmail, tierFor } from '@/config/plans';
import { formatDate, formatNaira } from '@/lib/ui/format';
import BillingActions from '@/components/dashboard/BillingActions';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import { siteOrigin } from '@/lib/seo/meta';

/**
 * Plan and billing.
 *
 * Free and Premium differ by how much a store can upload; the numbers come
 * from src/config/plans.ts, the same file that enforces them. Paystack sends
 * the seller back here after paying, with ?reference=hmsub_… — the payment is
 * confirmed with Paystack before anything changes.
 */

export const metadata = { title: 'Plan and billing', robots: { index: false } };

const ROWS = [
  ['products', 'Products'],
  ['imagesPerProduct', 'Photos per product'],
  ['posts', 'Journal posts'],
  ['projects', 'Portfolio projects'],
  ['maxUploadBytes', 'Largest photo you can upload'],
];

function show(key, value) {
  return key === 'maxUploadBytes' ? `${Math.round(value / 1024 / 1024)} MB` : value.toLocaleString('en-NG');
}

export default async function BillingPage({ params, searchParams }) {
  const { siteId } = await params;
  const { reference } = await searchParams;
  const { access } = await requireDashboardAccess(siteId);
  let site = access.site;

  // Back from Paystack: confirm with Paystack directly, then re-read.
  let confirmation = null;
  if (typeof reference === 'string' && isSubscriptionReference(reference)) {
    try {
      await enforceRateLimit('checkout:confirm', `ref:${reference}`);
      confirmation = await confirmPremiumPayment(reference);
    } catch {
      confirmation = 'pending';
    }
    ({ site } = await requireDashboardAccess(siteId).then((result) => result.access));
  }

  const tier = tierFor(site.planCode);
  const usage = await withSite(site, () => usageFor());
  const contact = salesContactEmail();
  const isOwner = access.role === 'owner' || access.role === 'platform_admin';
  const subscription = site.subscription ?? { status: 'none' };

  return (
    <div className="shell">
      <DashboardHeader siteId={siteId} current="billing" storeUrl={siteOrigin(site)} />
      <main className="container" style={{ paddingBlock: '40px 64px', maxWidth: 960 }}>
        <h1 style={{ fontSize: 28, marginBottom: 6 }}>Plan and billing</h1>
        <p className="secondary" style={{ marginTop: 0 }}>
          {site.name} is on <strong>{tier.label}</strong>
          {subscription.status === 'non_renewing' && subscription.currentPeriodEnd
            ? `, ending ${formatDate(subscription.currentPeriodEnd)}`
            : ''}
          .
        </p>

        {confirmation === 'upgraded' || confirmation === 'already_active' ? (
          <div className="alert alert--good" role="status" style={{ marginBlock: 16 }}>
            <span className="alert__icon" aria-hidden="true">✓</span>
            <span>Payment confirmed. Your store is on Premium.</span>
          </div>
        ) : confirmation ? (
          <div className="alert alert--info" role="status" style={{ marginBlock: 16 }}>
            <span className="alert__icon" aria-hidden="true">i</span>
            <span>We are still confirming your payment with Paystack. Refresh in a minute — you do not need to pay again.</span>
          </div>
        ) : null}

        {subscription.status === 'attention' ? (
          <div className="alert alert--warning" style={{ marginBlock: 16 }}>
            <span className="alert__icon" aria-hidden="true">!</span>
            <span>Paystack could not take your last Premium payment. Update your card from the link in Paystack&rsquo;s email to keep Premium.</span>
          </div>
        ) : null}

        <section className="card" style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>What you are using</h2>
          <div className="meters">
            {[
              ['products', 'Products'],
              ['posts', 'Journal posts'],
              ['projects', 'Portfolio projects'],
            ].map(([key, label]) => {
              const used = usage[key];
              const limit = tier.limits[key];
              const share = Math.min(1, used / limit);
              return (
                <div key={key} className="meter">
                  <div className="meter__head">
                    <span>{label}</span>
                    <span className="money">
                      {used} of {limit.toLocaleString('en-NG')}
                    </span>
                  </div>
                  <div className="meter__track" aria-hidden="true">
                    <span className={`meter__fill${share >= 0.9 ? ' is-near' : ''}`} style={{ transform: `scaleX(${share})` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="plans">
          {Object.values(TIERS).map((plan) => (
            <article key={plan.code} className={`plan${plan.code === tier.code ? ' is-current' : ''}`}>
              <h2 className="plan__name">{plan.label}</h2>
              <p className="plan__price">
                {formatNaira(plan.priceKobo).replace('.00', '')} <span>a month</span>
              </p>
              <p className="plan__pitch">{plan.pitch}</p>
              <dl className="plan__limits">
                {ROWS.map(([key, label]) => (
                  <div key={key}>
                    <dt>{label}</dt>
                    <dd>{show(key, plan.limits[key])}</dd>
                  </div>
                ))}
              </dl>
              {plan.code === tier.code ? (
                <p className="badge badge--accent">Your plan</p>
              ) : plan.code === 'pro' && isOwner ? (
                <BillingActions siteId={siteId} mode="upgrade" available={Boolean(premiumPlanCode())} />
              ) : null}
            </article>
          ))}
        </section>

        {TIERS_ARE_PLACEHOLDERS ? (
          <p className="calc__placeholder">
            <strong>Placeholder prices and limits.</strong> These are being finalised and may change before
            launch.
          </p>
        ) : null}

        {tier.code === 'pro' && isOwner && subscription.status === 'active' ? (
          <section className="card" style={{ marginTop: 20 }}>
            <BillingActions siteId={siteId} mode="cancel" available />
          </section>
        ) : null}

        <section style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 20, marginBottom: 12 }}>Add-ons</h2>
          <div className="addons">
            {ADDONS.map((addon) => (
              <article key={addon.id} className="card addon">
                <h3 style={{ fontSize: 17 }}>{addon.title}</h3>
                <p className="secondary">{addon.body}</p>
                {contact ? (
                  <a
                    className="btn"
                    href={`mailto:${contact}?subject=${encodeURIComponent(`${addon.subject} for ${site.name} (${site.slug})`)}`}
                  >
                    Email {contact}
                  </a>
                ) : (
                  <p className="hint">Contact details for this add-on are being set up.</p>
                )}
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

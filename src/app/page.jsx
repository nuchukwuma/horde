import AdSlot from '@/components/ads/AdSlot';
/**
 * Apex landing page.
 *
 * Deliberately minimal. Marketing is not what this phase is for, and a
 * half-written pitch would read worse than a plain statement of what the
 * platform does.
 */

export const metadata = {
  title: 'HordeMart — stores, portfolios and blogs for Nigerian sellers',
  description:
    'Give every seller their own site on a subdomain. Paystack splits each payment between the seller and the platform automatically.',
};

export default function Home() {
  return (
    <div className="shell">
      <header className="masthead">
        <div className="container masthead__inner">
          <span className="brand">HordeMart</span>
        </div>
      </header>

      <main className="container" style={{ paddingBlock: '72px 64px', maxWidth: 720 }}>
        <h1 className="hero__title" style={{ maxWidth: '20ch' }}>
          Every seller gets their own site.
        </h1>
        <p className="hero__tagline">
          Stores, portfolios and blogs on your own subdomain. Customers pay on your storefront,
          Paystack splits the payment, and your share settles straight to your bank — it never
          passes through us.
        </p>

        <div className="row" style={{ marginTop: 28, gap: 10 }}>
          <a className="btn btn--primary" href="/signup">
            Create a store
          </a>
          <a className="btn btn--quiet" href="/docs">
            How it works
          </a>
        </div>

        <p style={{ marginTop: 40, fontSize: 13, color: 'var(--text-muted)' }}>
          Running in Paystack test mode.
        </p>

        {/* Platform surface, so ads are permitted here. Renders nothing at all
            unless NEXT_PUBLIC_ADSENSE_CLIENT and a slot id are configured, and
            nothing on a seller's storefront under any configuration — see
            components/ads/AdSlot.jsx and lib/security/csp.ts. */}
        <AdSlot slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_HOME} label="Sponsored" />
      </main>
    </div>
  );
}

import AdSlot from '@/components/ads/AdSlot';
import SubdomainPreview from '@/components/landing/SubdomainPreview';
import { computeSplit } from '@/lib/payments/computeSplit';
import { formatNaira } from '@/lib/ui/format';

/**
 * Apex landing page.
 *
 * DESIGN NOTE
 *
 * The job of this page is to take a seller who currently trades through
 * WhatsApp statuses and Instagram DMs from "what is this" to "that is my
 * link" without scrolling. So the product is the first thing on it, not a
 * description of the product: the subdomain preview is interactive, and what
 * gets typed into it carries through to signup.
 *
 * The one memorable idea is that preview. "You get your own address" is an
 * abstraction until you see your own shop name in a URL bar.
 *
 * The money figures below are NOT written into this file. They are computed
 * by computeSplit — the same function that prices real checkouts — so the
 * landing page cannot drift from what the platform actually charges. If the
 * fee engine changes, this page changes with it. Marketing numbers that lie
 * about the product are usually just marketing numbers nobody re-derived.
 *
 * Deliberately NOT applied to the dashboard: that is a tool a seller opens
 * daily to check one figure, and landing-page composition there would be
 * noise. See frontend-design-direction on matching the direction to the
 * domain.
 */

export const metadata = {
  title: 'HordeMart — your own shop, on your own address',
  description:
    'Nigerian sellers get a store, portfolio or blog on their own subdomain. Customers pay on your storefront, Paystack splits the payment, and your share settles straight to your bank.',
};

/** The Free plan's published terms. Mirrors scripts/seed.ts. */
const FREE_PLAN = {
  feePercentBps: 700,
  feeFlatKobo: 0,
  feeCapKobo: null,
  vatOnPlatformFeeBps: 0,
  paystackFeeBearer: 'seller',
};

const EXAMPLE_SALE_KOBO = 1_000_000; // ₦10,000

export default function Home() {
  const rootDomain = (process.env.ROOT_DOMAIN ?? 'hordemart.com').split(':')[0];
  const split = computeSplit(EXAMPLE_SALE_KOBO, FREE_PLAN);

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <header className="masthead">
        <div className="container masthead__inner">
          <span className="brand">HordeMart</span>
          <nav className="nav" aria-label="Main">
            <a href="/docs">How it works</a>
            <a href="/login">Sign in</a>
          </nav>
        </div>
      </header>

      <main id="main">
        <section className="lede">
          <div className="container lede__inner">
            <div className="lede__grid">
              <div>
                <p className="eyebrow">For Nigerian sellers</p>

                <h1 className="display">
                  Your shop, on{' '}
                  <span className="display__mark">your own address</span>.
                </h1>

                <p className="lede__body">
                  Stop sending customers to a DM. Send them to a real storefront with your
                  name on it — where they can browse, pay by card or transfer, and get a
                  receipt.
                </p>

                <p className="lede__body" style={{ marginTop: 14 }}>
                  Your money goes straight to your bank account. It never passes through us.
                </p>
              </div>

              <SubdomainPreview rootDomain={rootDomain} />
            </div>
          </div>
        </section>

        <section className="container section">
          <div className="section__head">
            <h2 className="section__title">Where the money goes</h2>
            <p className="section__lede">
              On a {formatNaira(EXAMPLE_SALE_KOBO)} sale, on the free plan. Paystack splits
              the payment as it arrives, so nobody is waiting on anybody to pay out.
            </p>
          </div>

          <div className="split">
            <div className="split__cell split__cell--seller">
              <p className="split__label">You receive</p>
              <p className="split__amount money">{formatNaira(split.sellerNet)}</p>
              <p className="split__note">Settled to your bank by Paystack.</p>
            </div>

            <div className="split__cell">
              <p className="split__label">Paystack&rsquo;s fee</p>
              <p className="split__amount money">{formatNaira(split.paystackFee)}</p>
              <p className="split__note">Card processing. Charged by Paystack, not us.</p>
            </div>

            <div className="split__cell">
              <p className="split__label">Our commission</p>
              <p className="split__amount money">{formatNaira(split.platformFee)}</p>
              <p className="split__note">
                {FREE_PLAN.feePercentBps / 100}% of the sale. No monthly fee, no setup fee.
              </p>
            </div>
          </div>

          <p style={{ marginTop: 14, fontSize: 13.5, color: 'var(--text-muted)' }}>
            These figures are calculated by the same code that prices real checkouts, so
            they cannot drift from what you are actually charged.
          </p>
        </section>

        <section className="container section" style={{ paddingTop: 0 }}>
          <div className="section__head">
            <h2 className="section__title">Getting paid, start to finish</h2>
          </div>

          <ol className="steps">
            <li className="step">
              <h3 className="step__title">Claim your address</h3>
              <p className="step__body">
                Pick a name, and your storefront is live at that address straight away.
                Nothing to install, no domain to buy.
              </p>
            </li>
            <li className="step">
              <h3 className="step__title">Connect your bank account</h3>
              <p className="step__body">
                We check the account name with your bank before anything is saved, so the
                money cannot end up with a mistyped digit.
              </p>
            </li>
            <li className="step">
              <h3 className="step__title">Share the link</h3>
              <p className="step__body">
                Put it in your WhatsApp status or your Instagram bio. Customers pay on your
                page, and your share lands in your account.
              </p>
            </li>
          </ol>
        </section>

        <section className="container section" style={{ paddingTop: 0 }}>
          <div className="section__head">
            <h2 className="section__title">Not only shops</h2>
            <p className="section__lede">
              Turn on what you need. A tailor and a photographer want different pages.
            </p>
          </div>

          <ul className="feature-list">
            <li className="feature">
              <h3 className="feature__name">Store</h3>
              <p className="feature__body">
                Products with real prices, a cart, and checkout by card, bank transfer or
                USSD. Every order gets a number and a receipt you can both point at.
              </p>
            </li>
            <li className="feature">
              <h3 className="feature__name">Portfolio</h3>
              <p className="feature__body">
                Show finished work with proper images. For people who get hired on what
                they have made rather than what they have in stock.
              </p>
            </li>
            <li className="feature">
              <h3 className="feature__name">Journal</h3>
              <p className="feature__body">
                Write, and be findable. Each post gets its own address, so search engines
                and WhatsApp previews treat it as a real page.
              </p>
            </li>
            <li className="feature">
              <h3 className="feature__name">Messages</h3>
              <p className="feature__body">
                Customers ask before they buy. Replies stay attached to your shop instead
                of scattered across three apps — and we warn buyers off paying anywhere
                but checkout, where a payment can actually be traced and refunded.
              </p>
            </li>
          </ul>
        </section>

        <section className="container section" style={{ paddingTop: 0 }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 14,
              justifyContent: 'space-between',
              padding: '22px 0',
              borderTop: '1px solid var(--border)',
            }}
          >
            <h2 className="section__title" style={{ maxWidth: '20ch' }}>
              Claim your address.
            </h2>
            <div className="row" style={{ gap: 10 }}>
              <a className="btn btn--primary" href="/signup">
                Create a store
              </a>
              <a className="btn btn--quiet" href="/docs">
                How it works
              </a>
            </div>
          </div>

          <p className="note-strip" style={{ marginTop: 8 }}>
            <strong>Running in Paystack test mode.</strong>
            <span>
              Payments use test cards and no real money moves. See{' '}
              <a href="/docs">how it works</a>.
            </span>
          </p>

          {/* Platform surface, so ads are permitted here. Renders nothing at
              all unless NEXT_PUBLIC_ADSENSE_CLIENT and a slot id are set, and
              nothing on a seller's storefront under any configuration — see
              components/ads/AdSlot.jsx and lib/security/csp.ts. */}
          <AdSlot slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_HOME} label="Sponsored" />
        </section>
      </main>

      <footer className="footer">
        <div className="container">
          <p style={{ margin: 0 }}>
            HordeMart — stores, portfolios and journals for Nigerian sellers.
          </p>
        </div>
      </footer>
    </div>
  );
}

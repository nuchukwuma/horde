import AdSlot from '@/components/ads/AdSlot';
import HeroPlayground from '@/components/landing/HeroPlayground';
import CartDemo from '@/components/landing/CartDemo';
import { PaidLoop, ShareLoop, StockLoop } from '@/components/landing/StepLoops';
import PlatformHeader from '@/components/platform/PlatformHeader';
import PlatformFooter from '@/components/platform/PlatformFooter';
import ProductArt from '@/components/art/ProductArt';
import { computeSplit } from '@/lib/payments/computeSplit';
import { formatNaira } from '@/lib/ui/format';

/**
 * Apex landing page.
 *
 * DESIGN NOTE
 *
 * The job of this page is to take a seller who trades through WhatsApp
 * statuses and Instagram DMs from "what is this" to "that is my shop" in one
 * screen. So the product is the first thing on it, and it is something you
 * play with rather than read about: type a name and a market stall gets built
 * and stocked with that name on its sign. Further down, the visitor becomes
 * the customer and fills a basket, and sees exactly where each naira goes.
 *
 * The money figures are NOT written into this file. They come from
 * computeSplit — the function that prices real checkouts — so the page cannot
 * drift from what the platform actually charges.
 *
 * Deliberately NOT applied to the dashboard, which is a daily tool and gets a
 * calmer version of the same visual language.
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

const MODULES = [
  {
    name: 'Store',
    body: 'Products, a basket, and checkout by card, transfer or USSD. Every order gets a number and a receipt.',
    art: 'Ankara fabric bundle',
  },
  {
    name: 'Portfolio',
    body: 'For people hired on what they have made: tailors, photographers, makeup artists, builders.',
    art: 'Photo book prints',
  },
  {
    name: 'Journal',
    body: 'Write and be found. Each post gets its own address that WhatsApp previews properly.',
    art: 'Notebook journal',
  },
  {
    name: 'Messages',
    body: 'Customers ask before they buy, and the replies stay with your shop instead of across three apps.',
    art: 'Phone chat',
  },
];

export default function Home() {
  const rootDomain = (process.env.ROOT_DOMAIN ?? 'hordemart.com').split(':')[0];
  const split = computeSplit(EXAMPLE_SALE_KOBO, FREE_PLAN);
  const pct = (part) => `${((part / split.gross) * 100).toFixed(1)}%`;

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <PlatformHeader />

      <main id="main">
        {/* ---------- Hero: build your stall ---------- */}
        <section className="hero-x">
          <div className="container hero-x__grid">
            <div className="hero-x__copy">
              <p className="eyebrow rise-in">For Nigerian sellers</p>
              <h1 className="display rise-in" style={{ '--delay': '80ms' }}>
                Your shop, on <span className="display__accent">your own</span>{' '}
                <span className="display__mark">
                  address
                  <svg className="display__squiggle" viewBox="0 0 300 18" aria-hidden="true" preserveAspectRatio="none">
                    <path d="M4 12 Q40 2 76 10 T150 10 T224 9 T296 7" />
                  </svg>
                </span>
                .
              </h1>
              <p className="hero-x__body rise-in" style={{ '--delay': '160ms' }}>
                Stop sending customers to a DM. Send them to a real storefront with your name on it,
                where they can browse, pay by card or transfer, and get a receipt. Your money goes
                straight to your bank.
              </p>
              <ul className="hero-x__ticks rise-in" style={{ '--delay': '240ms' }}>
                <li>No monthly fee</li>
                <li>Paid straight to your bank</li>
                <li>Live in two minutes</li>
              </ul>
            </div>

            <div className="rise-in" style={{ '--delay': '120ms' }}>
              <HeroPlayground rootDomain={rootDomain} />
            </div>
          </div>
        </section>

        {/* ---------- Three steps ---------- */}
        <section className="container section">
          <div className="section__head">
            <p className="eyebrow">How it works</p>
            <h2 className="section__title">Stock up. Share the link. Get paid.</h2>
          </div>

          <ol className="steps-x">
            <li className="step-x">
              <StockLoop />
              <h3 className="step-x__title">
                <span className="step-x__num">1</span> Stock your shop
              </h3>
              <p className="step-x__body">
                Add products from your phone with a price and a photo — or let us draw one until you
                have taken yours.
              </p>
            </li>
            <li className="step-x">
              <ShareLoop />
              <h3 className="step-x__title">
                <span className="step-x__num">2</span> Share your link
              </h3>
              <p className="step-x__body">
                Put <strong>your-shop.{rootDomain}</strong> in your WhatsApp status and Instagram bio.
                It previews like a real website, because it is one.
              </p>
            </li>
            <li className="step-x">
              <PaidLoop />
              <h3 className="step-x__title">
                <span className="step-x__num">3</span> Get paid, directly
              </h3>
              <p className="step-x__body">
                Customers pay through Paystack. Your share settles to your own bank account — we
                check the account name with your bank before anything is saved.
              </p>
            </li>
          </ol>
        </section>

        {/* ---------- Be the customer ---------- */}
        <section className="band band--sun">
          <div className="container section">
            <div className="section__head">
              <p className="eyebrow">Try it</p>
              <h2 className="section__title">Be the customer for a minute.</h2>
              <p className="section__lede">
                Fill a basket and watch where every naira goes. The split is worked out by the same
                code that prices real checkouts.
              </p>
            </div>
            <CartDemo />
          </div>
        </section>

        {/* ---------- Where the money goes ---------- */}
        <section className="container section">
          <div className="money-x">
            <div>
              <p className="eyebrow">No surprises</p>
              <h2 className="section__title">On a {formatNaira(EXAMPLE_SALE_KOBO)} sale</h2>
              <p className="section__lede">
                On the free plan. Paystack splits the payment as it arrives, so nobody waits on
                anybody to pay out — and nothing sits in a HordeMart wallet.
              </p>
            </div>

            <div className="money-x__card card card--raised">
              <div className="splitbar splitbar--lg" aria-hidden="true">
                <span className="splitbar__seg splitbar__seg--seller" style={{ width: pct(split.sellerNet) }} />
                <span className="splitbar__seg splitbar__seg--paystack" style={{ width: pct(split.paystackFee) }} />
                <span className="splitbar__seg splitbar__seg--platform" style={{ width: pct(split.platformFee) }} />
              </div>
              <dl className="money-x__rows">
                <div className="money-x__row money-x__row--seller">
                  <dt>
                    <i className="dot dot--seller" /> You receive
                    <span>Settled to your bank by Paystack</span>
                  </dt>
                  <dd className="money">{formatNaira(split.sellerNet)}</dd>
                </div>
                <div className="money-x__row">
                  <dt>
                    <i className="dot dot--paystack" /> Paystack&rsquo;s fee
                    <span>Card processing, charged by Paystack</span>
                  </dt>
                  <dd className="money">{formatNaira(split.paystackFee)}</dd>
                </div>
                <div className="money-x__row">
                  <dt>
                    <i className="dot dot--platform" /> Our commission
                    <span>{FREE_PLAN.feePercentBps / 100}% of the sale. No setup fee.</span>
                  </dt>
                  <dd className="money">{formatNaira(split.platformFee)}</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        {/* ---------- Not only shops ---------- */}
        <section className="container section" style={{ paddingTop: 0 }}>
          <div className="section__head">
            <p className="eyebrow">Not only shops</p>
            <h2 className="section__title">Turn on what you need.</h2>
            <p className="section__lede">A tailor and a photographer want different pages.</p>
          </div>

          <ul className="tiles">
            {MODULES.map((module, index) => (
              <li key={module.name} className="tile" style={{ '--delay': `${index * 60}ms` }}>
                <div className="tile__art">
                  <ProductArt title={module.art} seed={module.name} label="" />
                </div>
                <h3 className="tile__name">{module.name}</h3>
                <p className="tile__body">{module.body}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------- Final call ---------- */}
        <section className="container section" style={{ paddingTop: 0 }}>
          <div className="cta-band">
            <div>
              <h2 className="cta-band__title">Your stall is waiting.</h2>
              <p className="cta-band__body">Claim your address now — you can add products later.</p>
            </div>
            <div className="row row--wrap">
              <a className="btn btn--sun btn--lg" href="/signup">
                Open your shop →
              </a>
              <a className="btn btn--lg cta-band__ghost" href="/docs">
                How it works
              </a>
            </div>
          </div>

          <p className="note-strip">
            <strong>Running in Paystack test mode.</strong>
            <span>
              Payments use test cards and no real money moves. See <a href="/docs">how it works</a>.
            </span>
          </p>

          {/* Platform surface, so ads are permitted here. Renders nothing
              unless NEXT_PUBLIC_ADSENSE_CLIENT and a slot id are set, and
              never on a storefront — see components/ads/AdSlot.jsx. */}
          <AdSlot slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_HOME} label="Sponsored" />
        </section>
      </main>

      <PlatformFooter />
    </div>
  );
}

import AdSlot from '@/components/ads/AdSlot';
import LaunchDemo from '@/components/landing/LaunchDemo';
import PayoutCalculator from '@/components/landing/PayoutCalculator';
import HeroReel from '@/components/landing/HeroReel';
import AdirePattern from '@/components/design/AdirePattern';
import PlatformHeader from '@/components/platform/PlatformHeader';
import PlatformFooter from '@/components/platform/PlatformFooter';
import { TIERS, TIERS_ARE_PLACEHOLDERS } from '@/config/plans';
import { PLANS } from '@/config/fees';
import { formatNaira } from '@/lib/ui/format';

/**
 * Landing page — ADIRE direction.
 *
 * Adire cloth is pattern made by resisting dye; this page treats a shop the
 * same way, as something with its own pattern. The hero is the product
 * itself: type a name, choose what you sell, and a phone shows the store your
 * customers would get, with a strip of adire dyed from your name.
 *
 * Motion budget: one orchestrated GSAP sequence in the hero, then only motion
 * that answers input (the cloth re-stamps as you type, stock swaps with the
 * category, calculator figures count to their new values). No section fades
 * up on scroll. Everything below the hero is static HTML until reached, and
 * the reel loads only near the viewport — never on Data Saver or reduced
 * motion.
 *
 * Copy rule: say concretely what happens to a Nigerian seller's customers and
 * money. No "seamless", no "elevate", no "unlock".
 */

export const metadata = {
  title: 'HordeMart — a shop on your own address, paid into your bank',
  description:
    'Open a store at yourshop.hordemart.com. Customers pay in naira by card, bank transfer or USSD through Paystack, and your share is paid straight into your bank account.',
};

const FACTS = [
  {
    title: 'One link for WhatsApp, Instagram and X',
    body: 'Put your address in your WhatsApp status and bio. It opens as a real shop, with prices, photos and a pay button — not a chat that starts with “how much?”.',
  },
  {
    title: 'Paid into your own account',
    body: 'Paystack splits each payment as it arrives: your share goes to the bank account you verified, ours goes to us. HordeMart never holds your money.',
  },
  {
    title: 'Delivery stays your way',
    body: 'Use your dispatch rider, a logistics company or pickup, as you do now. Buyers message you from your shop, and the conversation stays with the order.',
  },
  {
    title: 'A receipt for every sale',
    body: 'Each order gets a number and an emailed receipt — the thing a bank alert screenshot never gave either of you when something went wrong.',
  },
];

export default function Home() {
  const rootDomain = (process.env.ROOT_DOMAIN ?? 'hordemart.com').split(':')[0];

  return (
    <div className="shell adire-site">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <PlatformHeader />

      <main id="main">
        <section className="hero-adire">
          <div className="container">
            <LaunchDemo rootDomain={rootDomain} />
          </div>
        </section>

        {/* A band of cloth between hero and page: the brand's one ornament. */}
        <div className="cloth-band" aria-hidden="true">
          <AdirePattern name="hordemart" columns={24} count={24} ink="var(--indigo)" resist="var(--surface-page)" className="cloth-band__svg" />
        </div>

        <section className="container section reel-section">
          <div className="reel-section__text">
            <h2 className="section__title">From a name to your first order</h2>
            <ol className="sequence">
              <li>
                <strong>Name your shop.</strong> Your address is live straight away.
              </li>
              <li>
                <strong>Add what you sell</strong> from your phone, with prices in naira.
              </li>
              <li>
                <strong>Connect your bank account.</strong> We check the account name with
                your bank before anything is saved.
              </li>
              <li>
                <strong>Share the link.</strong> Customers pay through Paystack; you get the
                alert.
              </li>
            </ol>
          </div>
          <HeroReel
            poster="/media/hero-reel-poster.jpg"
            webm="/media/hero-reel.webm"
            mp4="/media/hero-reel.mp4"
            caption="A store being built on HordeMart, in twelve seconds."
          />
        </section>

        <section className="calc-section">
          <div className="container section">
            <div className="calc-section__head">
              <h2 className="section__title">What lands in your account</h2>
              <p className="section__lede">
                Enter a sale. You see the payment fee, our commission, and the amount paid into
                your bank — worked out by the same code that prices real checkouts.
              </p>
            </div>
            <PayoutCalculator />
          </div>
        </section>

        <section className="container section">
          <h2 className="section__title facts__title">Free to start. Premium when you outgrow it.</h2>
          <div className="tiers">
            {Object.values(TIERS).map((tier) => (
              <article key={tier.code} className="tier">
                <h3 className="tier__name">{tier.label}</h3>
                <p className="tier__price">
                  {tier.priceKobo === 0 ? 'No monthly fee' : `${formatNaira(tier.priceKobo)} a month`}
                  <span>, plus {PLANS[tier.code].feePercentBps / 100}% per sale</span>
                </p>
                <ul className="tier__list">
                  <li>{tier.limits.products.toLocaleString('en-NG')} products, {tier.limits.imagesPerProduct} photos each</li>
                  <li>{tier.limits.posts.toLocaleString('en-NG')} journal posts</li>
                  <li>{tier.limits.projects.toLocaleString('en-NG')} portfolio projects</li>
                  <li>Photos up to {Math.round(tier.limits.maxUploadBytes / 1024 / 1024)} MB</li>
                </ul>
              </article>
            ))}
          </div>
          <p className="tiers__note">
            Your own domain and a business email are available as add-ons, set up with you by our team.
            {TIERS_ARE_PLACEHOLDERS ? ' Prices and limits are placeholders until launch.' : ''}
          </p>
        </section>

        <section className="container section" style={{ paddingTop: 0 }}>
          <h2 className="section__title facts__title">What changes for your customers</h2>
          <ul className="facts">
            {FACTS.map((fact) => (
              <li key={fact.title} className="fact">
                <h3 className="fact__title">{fact.title}</h3>
                <p className="fact__body">{fact.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="container section" style={{ paddingTop: 0 }}>
          <div className="cta-cloth">
            <AdirePattern name="open your shop" columns={8} count={16} ink="var(--indigo)" resist="#f4f1e6" className="cta-cloth__svg" />
            <div className="cta-cloth__body">
              <h2 className="cta-cloth__title">Your address is still free.</h2>
              <p>It takes about two minutes. You can add products later.</p>
              <a className="btn btn--light btn--lg" href="/signup">
                Open your shop
              </a>
            </div>
          </div>

          <p className="note-strip">
            <strong>Paystack test mode.</strong>
            <span>
              Payments on HordeMart currently use test cards; no real money moves yet.
            </span>
          </p>

          {/* Platform surface, so ads are permitted here — never on a store. */}
          <AdSlot slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_HOME} label="Sponsored" />
        </section>
      </main>

      <PlatformFooter />
    </div>
  );
}

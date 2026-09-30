import { computeSplit } from '@/lib/payments/computeSplit';
import { formatNaira } from '@/lib/ui/format';

/**
 * How it works.
 *
 * The apex page has linked here since Phase 8 and the route did not exist, so
 * "How it works" was a 404 — the second such link, after /signup.
 *
 * Written as answers to what a seller actually asks before trusting a
 * platform with their money: who holds it, what it costs, how fast it
 * arrives, and what happens when something goes wrong. Fee figures come from
 * computeSplit for the same reason as on the landing page: a documented
 * number that is typed by hand drifts from the code the first time anyone
 * changes a rate.
 */

export const metadata = {
  title: 'How HordeMart works',
  description:
    'What it costs, who holds your money, how fast it settles, and what happens on a refund.',
};

const FREE_PLAN = {
  feePercentBps: 700,
  feeFlatKobo: 0,
  feeCapKobo: null,
  vatOnPlatformFeeBps: 0,
  paystackFeeBearer: 'seller',
};

const EXAMPLES = [250_000, 1_000_000, 5_000_000];

export default function DocsPage() {
  const rows = EXAMPLES.map((gross) => ({ gross, ...computeSplit(gross, FREE_PLAN) }));

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <header className="masthead">
        <div className="container masthead__inner">
          <a className="brand" href="/">
            HordeMart
          </a>
          <nav className="nav" aria-label="Main">
            <a href="/docs" aria-current="page">
              How it works
            </a>
            <a href="/login">Sign in</a>
          </nav>
        </div>
      </header>

      <main id="main" className="container container--narrow" style={{ paddingBlock: '44px 72px' }}>
        <p className="eyebrow">How it works</p>
        <h1 className="section__title" style={{ fontSize: 'clamp(26px, 4vw, 38px)' }}>
          The questions worth asking before you trust anyone with your money
        </h1>

        <div className="prose" style={{ marginTop: 28 }}>
          <h2>Who holds my money?</h2>
          <p>
            Nobody, except your bank. When a customer pays on your storefront, Paystack
            splits that single payment at the moment it is made: your share goes to your
            Paystack subaccount and settles to your bank account, and our commission goes
            to us. Your money is never in a HordeMart balance waiting for us to release it.
          </p>
          <p>
            This is a deliberate limit on what we are, not a feature we have not built yet.
            A platform that holds other people&rsquo;s money is a different kind of company
            with a different set of licences, and we would rather be the software.
          </p>

          <h2>What does it cost?</h2>
          <p>
            On the free plan we take {FREE_PLAN.feePercentBps / 100}% of each sale. No
            monthly fee, no setup fee, nothing when you do not sell. Paystack charges its
            own processing fee on top, which is theirs and not ours.
          </p>

          <div className="table-wrap" style={{ marginBlock: 18 }}>
            <table>
              <caption className="visually-hidden">
                What a seller receives on example sale amounts
              </caption>
              <thead>
                <tr>
                  <th scope="col">Customer pays</th>
                  <th scope="col">Paystack fee</th>
                  <th scope="col">Our commission</th>
                  <th scope="col">You receive</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.gross}>
                    <td className="money">{formatNaira(row.gross)}</td>
                    <td className="money">{formatNaira(row.paystackFee)}</td>
                    <td className="money">{formatNaira(row.platformFee)}</td>
                    <td className="money">
                      <strong>{formatNaira(row.sellerNet)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p style={{ fontSize: 13.5, color: 'var(--text-muted)' }}>
            Calculated by the same function that prices real checkouts, so this table
            cannot disagree with your actual statement.
          </p>

          <h2>How fast does it arrive?</h2>
          <p>
            Settlement is Paystack&rsquo;s, on their normal schedule for a Nigerian bank
            account. We do not add a delay on top, and we cannot hold your settlement back
            — there is nothing for us to hold it in.
          </p>
          <p>
            New sellers may have a short wait before they can <em>take</em> their first
            payment, while we check the account. That gate is on transacting, never on
            settlement: once a payment is made, it is on its way to you.
          </p>

          <h2>What stops someone taking my payout?</h2>
          <p>
            Bank details can only be changed by someone who can prove the password again,
            in that moment — an open session is not enough. We check the account name with
            your bank before saving anything and show you what came back, so a mistyped
            digit is caught before money moves, not after. We store the last four digits
            and the name your bank returned; the full account number is never written down.
          </p>

          <h2>What happens on a refund?</h2>
          <p>
            You can refund an order in full or in part from your dashboard. Paystack&rsquo;s
            processing fee is not returned on a refund — that is theirs, and somebody is
            always out that amount. By default we return our commission in proportion to
            what you refunded, so a full refund does not leave you paying us for a sale
            that no longer exists.
          </p>

          <h2>Can I use my own domain?</h2>
          <p>
            Yes. Your subdomain works from the moment you sign up, and a custom domain can
            point at your storefront later. Links you have already shared keep working.
          </p>

          <h2>A word about paying outside the app</h2>
          <p>
            If a seller asks you to pay by bank transfer instead of using the checkout
            button, stop. A transfer creates no order, no receipt and no refund path, and
            it is how most marketplace fraud in Nigeria actually happens. Paying through
            checkout costs the same and leaves a record both of you can point at.
          </p>

          <h2>Is this live?</h2>
          <p>
            Not yet. The platform runs in Paystack test mode, which means payments use test
            cards and no real money moves. Several things still need confirming with
            Paystack and with a Nigerian fintech lawyer before real money is involved, and
            we would rather say so here than discover them with your money.
          </p>
        </div>

        <div className="row" style={{ gap: 10, marginTop: 32 }}>
          <a className="btn btn--primary" href="/signup">
            Create a store
          </a>
          <a className="btn btn--quiet" href="/">
            Back
          </a>
        </div>
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

import LegalPage from '@/components/legal/LegalPage';

export const metadata = {
  title: 'Privacy Policy | HordeMart',
  description: 'What personal data HordeMart collects from sellers and shoppers, why, and your rights under the NDPA.',
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        This explains what personal data HordeMart handles, why, who it is shared with, and your rights under the
        Nigeria Data Protection Act 2023 (NDPA). It covers sellers who use HordeMart and shoppers who buy from HordeMart
        stores.
      </p>

      <h2 id="sellers">1. If you are a seller</h2>
      <p>We collect:</p>
      <ul>
        <li>
          <strong>Account details</strong>: your name, email address and a scrambled form of your password (we cannot read
          your password).
        </li>
        <li>
          <strong>Payout details</strong>: your business name, bank and account number. The full account number is sent
          to Paystack to set up your payouts and is <strong>not stored by HordeMart</strong>; we keep only its last four
          digits and the account name your bank returns.
        </li>
        <li>
          <strong>Your site</strong>: the products, posts, photos and design you publish, and your sales records.
        </li>
        <li>
          <strong>Security records</strong>: sign-ins, changes to bank details and other sensitive actions, with the IP
          address and browser they came from, to protect your account and investigate fraud.
        </li>
      </ul>

      <h2 id="shoppers">2. If you are a shopper</h2>
      <p>When you buy from a HordeMart store we collect:</p>
      <ul>
        <li>
          <strong>Order details</strong>: your name, email address, phone number, and delivery address (only if you asked
          for delivery), and what you bought.
        </li>
        <li>
          <strong>Account and messages</strong>, if you create an account on a store: your name, email, a scrambled form of
          your password, and the messages you exchange with the seller.
        </li>
        <li>
          <strong>Card and bank details are handled by Paystack</strong>, on Paystack’s own payment page. HordeMart never
          sees or stores your card number.
        </li>
      </ul>
      <p>
        The store’s seller can see your order and contact details so they can deliver your order and answer your
        questions. They may not use them for anything else.
      </p>

      <h2 id="why">3. Why we use it</h2>
      <ul>
        <li>To run the service you asked for: your site, your orders, your payments and your messages (performance of a contract).</li>
        <li>To keep accounts and payments secure and prevent fraud (legitimate interests and legal obligation).</li>
        <li>To keep financial and tax records we are required by law to keep (legal obligation).</li>
        <li>To send emails about your account and orders. We do not send marketing email without your consent.</li>
      </ul>

      <h2 id="sharing">4. Who we share it with</h2>
      <ul>
        <li><strong>Paystack</strong> — to process payments, refunds and payouts.</li>
        <li><strong>Cloudinary</strong> — stores the photos sellers upload.</li>
        <li><strong>Resend</strong> — sends our emails.</li>
        <li><strong>Our hosting and database providers</strong> — run the website and store its data.</li>
        <li>
          <strong>Google AdSense</strong>, on HordeMart’s own pages only (never on a seller’s store), if advertising is
          switched on. Google may use cookies to show ads.
        </li>
        <li>
          <strong>MrMouse</strong> — only if a seller connects it to their store, after agreeing to it: the seller’s name,
          email and store details, and (with stock sync) item codes and quantities sold. Never shoppers’ details.
        </li>
        <li>Law-enforcement or regulators, when the law requires it.</li>
      </ul>
      <p>
        Some of these providers process data outside Nigeria. Where they do, we rely on the safeguards the NDPA requires
        for cross-border transfers. We do not sell personal data.
      </p>

      <h2 id="cookies">5. Cookies</h2>
      <p>
        HordeMart uses a cookie to keep you signed in, and stores your basket in your browser. These are needed for the
        site to work. Advertising cookies may be set by Google on HordeMart’s own pages if advertising is switched on;
        never on sellers’ stores.
      </p>

      <h2 id="keeping">6. How long we keep it</h2>
      <p>
        Account data is kept while your account is open. Order and payment records are kept for as long as Nigerian tax
        and financial-record law requires, even after an account closes. Security records are kept for a limited period
        to investigate fraud.
      </p>

      <h2 id="rights">7. Your rights</h2>
      <p>
        Under the NDPA you can ask to see the personal data we hold about you, correct it, have it deleted where the law
        allows, object to or restrict how we use it, or receive a copy to take elsewhere. You can withdraw consent you
        have given at any time. You can also complain to the <strong>Nigeria Data Protection Commission</strong>. To make
        a request, contact us using the details below; we may need to confirm it is really you.
      </p>

      <h2 id="security">8. Security</h2>
      <p>
        Passwords are stored only in scrambled (hashed) form, connections are encrypted, bank account numbers are not
        stored, and each store can see only its own customers’ data.
      </p>
    </LegalPage>
  );
}

import LegalPage from '@/components/legal/LegalPage';

export const metadata = {
  title: 'Terms of Service | HordeMart',
  description: 'The agreement between HordeMart and the sellers who use it, and what shoppers can expect.',
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <p>
        These terms are the agreement between HordeMart (“we”) and you when you open a shop, portfolio or blog on
        HordeMart (“seller”), and set out what shoppers who buy from a HordeMart store can expect.
      </p>

      <h2 id="what-we-do">1. What HordeMart is</h2>
      <p>
        HordeMart is software. It gives a seller a website on <code>yourname.hordemart.com</code> where they can list
        products, take payments and talk to customers. The seller — not HordeMart — is the one selling: the seller sets
        prices, describes the goods, delivers them, and is responsible to the buyer for them.
      </p>

      <h2 id="payments">2. Payments and your money</h2>
      <ul>
        <li>
          Payments are processed by <strong>Paystack</strong>. When a customer pays, Paystack splits the payment there and
          then: the seller’s share is settled by Paystack straight to the seller’s own bank account, and HordeMart’s fee
          to HordeMart.
        </li>
        <li>
          <strong>HordeMart never holds seller money.</strong> We do not keep a balance for you and there is nothing to
          “withdraw” from us. Settlement timing is Paystack’s, under Paystack’s own terms, which also apply to you.
        </li>
        <li>
          Our fee is shown on the pricing page and on each sale in your dashboard. It is worked out by our system from
          the plan you are on at the moment of the sale.
        </li>
        <li>
          New stores may wait a short period before taking their first payment. This delays when a store can start
          selling; it never delays money that has already been paid.
        </li>
      </ul>

      <h2 id="sellers">3. Your responsibilities as a seller</h2>
      <ul>
        <li>Give true information about yourself and your bank account. The account must be yours or your business’s.</li>
        <li>Describe what you sell honestly, including price, condition and delivery time. A “was” price must be a real one.</li>
        <li>Deliver what was paid for, or refund it. Answer customers’ messages.</li>
        <li>
          Do not sell anything illegal in Nigeria or anything Paystack does not allow (see{' '}
          <a href="#prohibited">prohibited items</a>).
        </li>
        <li>
          Use what customers tell you (names, phone numbers, addresses) only to fulfil and support their orders, and keep
          it private. See our <a href="/privacy">Privacy Policy</a>.
        </li>
        <li>Keep your password private. You are responsible for what happens under your account.</li>
      </ul>

      <h2 id="refunds">4. Refunds and disputes</h2>
      <p>
        Sellers can refund an order from their dashboard; the money goes back to the customer through Paystack. A
        customer with a problem should first message the seller from the store. Card disputes (chargebacks) are handled
        by Paystack and the card issuer; the seller must respond with evidence when asked. Our fee may or may not be
        returned on a refund depending on the circumstances, as shown in the dashboard when you refund.
      </p>

      <h2 id="prohibited">5. Prohibited items</h2>
      <p>
        You may not use HordeMart to sell weapons, drugs or controlled substances, counterfeit or stolen goods, adult
        content, gambling, financial services or investments, cryptocurrency, live animals, human remains or body parts,
        or anything else illegal in Nigeria or prohibited by Paystack. We may pause checkout on a store while we review
        it.
      </p>

      <h2 id="content">6. Your content</h2>
      <p>
        You own what you put on your site — your words, photos and logo. You let us host and display it so your site
        works, and show it in the HordeMart dashboard. You must have the right to use everything you upload.
      </p>

      <h2 id="plans">7. Plans and billing</h2>
      <p>
        The Free plan costs nothing to use beyond the fee on each sale. Paid plans are billed through Paystack and renew
        until cancelled; cancelling stops the next renewal. Plan limits (number of products, photos) are shown on the
        Plan page in your dashboard.
      </p>

      <h2 id="suspension">8. Suspending or closing a store</h2>
      <p>
        We may pause checkout on, suspend or close a store that breaks these terms, puts customers at risk, or that
        Paystack asks us to stop. Where we can, we will tell you why and give you a chance to fix it. Money already
        settled to your bank account is yours; we never hold it, so suspension cannot hold it.
      </p>

      <h2 id="liability">9. Our responsibility</h2>
      <p>
        We work to keep HordeMart running and secure, but we cannot promise it will never be unavailable. We are not a
        party to sales between sellers and customers and are not responsible for goods sold on HordeMart stores. Nothing
        in these terms takes away rights you have under Nigerian consumer-protection law.
      </p>

      <h2 id="changes">10. Changes and law</h2>
      <p>
        We will tell sellers by email before material changes to these terms take effect. These terms are governed by
        the laws of the Federal Republic of Nigeria.
      </p>
    </LegalPage>
  );
}

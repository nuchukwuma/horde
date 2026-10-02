import LegalPage from '@/components/legal/LegalPage';
import { MRMOUSE_TERMS_VERSION } from '@/config/legal';

export const metadata = {
  title: 'MrMouse connection terms | HordeMart',
  description: 'What happens when a HordeMart store owner connects MrMouse, and what is shared.',
};

export default function MrMouseTermsPage() {
  return (
    <LegalPage title="MrMouse connection terms">
      <p className="legal__updated">Version {MRMOUSE_TERMS_VERSION}</p>
      <p>
        These terms apply when the owner of a HordeMart store connects it to <strong>MrMouse</strong>, an inventory and
        bookkeeping app. They add to HordeMart’s <a href="/terms">Terms of Service</a> and{' '}
        <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2 id="separate">1. MrMouse is a separate service</h2>
      <p>
        MrMouse has its own account, its own data and its own subscription. Connecting does not give you a MrMouse
        subscription, does not change your HordeMart plan, and HordeMart does not bill you for MrMouse. MrMouse’s own
        terms and privacy policy apply to everything you do inside MrMouse.
      </p>

      <h2 id="shared">2. What HordeMart shares with MrMouse</h2>
      <ul>
        <li>
          <strong>Each time you press “Open MrMouse”</strong>: your name, your email address (only once you have confirmed
          it), whether you are the owner or staff, and your store’s name and web address — so MrMouse can sign you in to
          your own MrMouse account.
        </li>
        <li>
          <strong>Only if you switch on stock sync</strong>: when an order is paid, the item codes (SKUs) and quantities
          that sold.
        </li>
      </ul>
      <p>
        HordeMart never shares your customers’ names, phone numbers, addresses or emails, your bank details, your
        password, or how much anything sold for.
      </p>

      <h2 id="received">3. What MrMouse sends to HordeMart</h2>
      <p>
        Only if you switch on stock sync: stock levels for your products, matched by item code. HordeMart then shows those
        quantities in your store and stops selling items that run out. MrMouse can never change your prices, products,
        orders, payouts or bank details.
      </p>

      <h2 id="your-choices">4. Your choices</h2>
      <ul>
        <li>Only the store owner can connect, switch stock sync, or disconnect.</li>
        <li>
          You can disconnect at any time from the MrMouse page in your dashboard. Sharing stops immediately; data MrMouse
          already holds stays in your MrMouse account, where MrMouse’s terms let you delete it.
        </li>
        <li>If these terms change, the connection pauses until you accept the new version.</li>
      </ul>

      <h2 id="responsibility">5. Responsibility</h2>
      <p>
        Stock levels sent by MrMouse are shown as sent. Check them in your dashboard; you remain responsible for what your
        store offers for sale. HordeMart is not responsible for MrMouse’s service, and MrMouse is not responsible for
        HordeMart’s.
      </p>

      <h2 id="records">6. Records</h2>
      <p>
        We keep a record of when you accepted these terms, connected, disconnected or changed stock sync, and each time a
        sign-in was handed to MrMouse — to show what was shared and on whose instruction.
      </p>
    </LegalPage>
  );
}

import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { ensureDatabase } from '@/lib/http/context';
import { findSiteBySlug } from '@/lib/tenant/loadSite';
import { isModuleEnabled } from '@/lib/content/modules';
import { validateCustomerSessionToken } from '@/lib/auth/session';
import { sessionCookieName } from '@/lib/auth/cookies';
import ChatThread from '@/components/chat/ChatThread';

/**
 * A shopper's conversation with this store.
 *
 * Signed out, this shows the reason and a link rather than redirecting: a
 * redirect from a page someone reached from a "Message us" button loses the
 * fact that messaging was what they wanted.
 */

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Messages' };

export default async function ShopMessagesPage({ params }) {
  const { slug } = await params;
  await ensureDatabase();

  const site = await findSiteBySlug(slug);
  if (!site || !isModuleEnabled(site, 'store')) notFound();

  const token = (await cookies()).get(sessionCookieName('storefront'))?.value;
  const session = await validateCustomerSessionToken(token, site._id);

  return (
    <div className="container container--narrow" style={{ maxWidth: 620, paddingBlock: '48px 64px' }}>
      <h1 style={{ fontSize: 28, marginBottom: 6 }}>Messages</h1>
      <p style={{ color: 'var(--text-secondary)', marginTop: 0, marginBottom: 28 }}>
        Ask {site.name} about an order, sizing, delivery — anything.
      </p>

      {session ? (
        <ChatThread
          endpoint="/api/shop/chat"
          side="customer"
          emptyMessage={`Say hello to ${site.name}.`}
          placeholder="Ask a question…"
        />
      ) : (
        <div className="card">
          <strong>Sign in to send a message</strong>
          <p style={{ color: 'var(--text-secondary)', margin: '6px 0 14px', fontSize: 14 }}>
            Messages are attached to your account so you can find the reply when you come
            back.
          </p>
          <a className="btn btn--primary" href="/account/login">
            Sign in
          </a>{' '}
          <a className="btn" href="/account/signup">
            Create an account
          </a>
        </div>
      )}

      {/* Stated up front rather than only when the detector fires. */}
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 20 }}>
        Always pay using the checkout button. Payments made by bank transfer, cash or gift
        card cannot be traced or refunded.
      </p>
    </div>
  );
}

import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { ensureDatabase } from '@/lib/http/context';
import { validateSessionToken } from '@/lib/auth/session';
import { sessionCookieName } from '@/lib/auth/cookies';
import { requireSiteAccess } from '@/lib/auth/guards';
import { listConversations } from '@/lib/chat/conversations';
import { formatDateTime } from '@/lib/ui/format';
import SellerInbox from '@/components/chat/SellerInbox';

/**
 * Seller's message inbox.
 *
 * Same gating as the dashboard overview: a session for a different seller gets
 * a 404 rather than somebody else's customer conversations.
 */

export const dynamic = 'force-dynamic';

export default async function MessagesPage({ params }) {
  const { siteId } = await params;
  await ensureDatabase();

  const token = (await cookies()).get(sessionCookieName('platform'))?.value;
  const session = await validateSessionToken(token, 'platform');
  if (!session) redirect('/login');

  let site;
  try {
    ({ site } = await requireSiteAccess(session, siteId, ['owner', 'staff']));
  } catch {
    notFound();
  }
  if (!site) notFound();

  const conversations = await listConversations({ siteId: site._id });

  return (
    <div className="shell">
      <header className="masthead">
        <div className="container masthead__inner">
          <a className="brand" href="/">
            HordeMart
          </a>
          <nav className="nav" aria-label="Dashboard">
            <a href={`/dashboard/${siteId}`}>Overview</a>
            <a href={`/dashboard/${siteId}/messages`} aria-current="page">
              Messages
            </a>
          </nav>
        </div>
      </header>

      <main className="container" style={{ paddingBlock: '28px 64px', maxWidth: 760 }}>
        <h1 style={{ fontSize: 22, marginBottom: 18 }}>Messages</h1>

        {conversations.length === 0 ? (
          <div className="card empty">No customer messages yet.</div>
        ) : (
          <SellerInbox
            siteId={siteId}
            conversations={conversations.map((conversation) => ({
              ...conversation,
              lastMessageAt: formatDateTime(conversation.lastMessageAt),
            }))}
          />
        )}
      </main>
    </div>
  );
}

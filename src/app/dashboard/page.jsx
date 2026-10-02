import { cookies } from 'next/headers';
import { redirectIfTermsOutdated } from '@/lib/legal/termsGate';
import { redirect } from 'next/navigation';
import { connectToDatabase } from '@/lib/db/connect';
import { validateSessionToken } from '@/lib/auth/session';
import { sessionCookieName } from '@/lib/auth/cookies';
import { Membership } from '@/lib/db/models/Membership';
import PlatformHeader from '@/components/platform/PlatformHeader';

/**
 * /dashboard with no store in the address — a bookmark, a typed URL, the app
 * host's front door. It used to be a 404. Sends a signed-in seller to their
 * store (the same choice sign-in makes), and anyone else to sign in.
 */

export const metadata = { title: 'Dashboard', robots: { index: false } };

export default async function DashboardIndex() {
  await connectToDatabase();
  const token = (await cookies()).get(sessionCookieName('platform'))?.value;
  const session = await validateSessionToken(token, 'platform');
  if (!session) redirect('/login');
  redirectIfTermsOutdated(session.user, '/dashboard');

  const membership = await Membership.findOne({ userId: session.user._id }).sort({ createdAt: 1 }).lean();
  if (membership) redirect(`/dashboard/${membership.siteId}`);
  // A platform admin with no store of their own lands on the admin panel.
  if (session.user.platformRole === 'admin') redirect('/admin');

  return (
    <div className="shell">
      <PlatformHeader />
      <main id="main" className="container section" style={{ maxWidth: 560 }}>
        <h1 className="page-head__title" style={{ fontSize: 32 }}>
          You don’t have a store yet
        </h1>
        <p className="muted">Your account is signed in, but it isn’t linked to a store. Open one now — it takes about two minutes.</p>
        <p style={{ marginTop: 24 }}>
          <a className="btn btn--primary btn--lg" href="/signup">
            Open your shop
          </a>
        </p>
      </main>
    </div>
  );
}

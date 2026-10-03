import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { connectToDatabase } from '@/lib/db/connect';
import { validateSessionToken } from '@/lib/auth/session';
import { sessionCookieName } from '@/lib/auth/cookies';
import { needsTermsAcceptance, safeNextPath } from '@/lib/legal/terms';
import PlatformHeader from '@/components/platform/PlatformHeader';
import AcceptTermsForm from '@/components/legal/AcceptTermsForm';

/**
 * "Our terms have changed — accept to continue." Shown to a signed-in seller
 * whose accepted version is not the current one (lib/legal/termsGate.ts).
 */

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Accept the terms', robots: { index: false } };

export default async function AcceptTermsPage({ searchParams }) {
  const { next } = await searchParams;
  const target = safeNextPath(next);

  await connectToDatabase();
  const token = (await cookies()).get(sessionCookieName('platform'))?.value;
  const session = await validateSessionToken(token, 'platform');
  if (!session) redirect('/login');
  if (!needsTermsAcceptance(session.user)) redirect(target);

  const firstTime = !session.user.termsAcceptedVersion;

  return (
    <div className="shell">
      <PlatformHeader />
      <main id="main" className="container container--narrow auth-simple">
        <h1 className="auth__title">{firstTime ? 'Please accept our terms' : 'Our terms have changed'}</h1>
        <p className="auth__lede">
          {firstTime
            ? 'Before you carry on, please read and accept HordeMart’s Terms of Service and Privacy Policy.'
            : 'We have updated our Terms of Service and Privacy Policy. Please read them and accept to carry on using your dashboard.'}
        </p>
        <AcceptTermsForm next={target} />
      </main>
    </div>
  );
}

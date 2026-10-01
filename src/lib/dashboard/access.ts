/**
 * Page-level guard for dashboard routes: signed-in seller, member of this
 * site, with the given permission. Redirects to /login when signed out and
 * 404s otherwise — a non-member learns nothing about whether a site exists.
 */

import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { connectToDatabase } from '../db/connect';
import { validateSessionToken, type AuthenticatedSession } from '../auth/session';
import { sessionCookieName } from '../auth/cookies';
import { assertPermission, requireSiteAccess, type SiteAccess } from '../auth/guards';
import type { StaffPermission } from '../db/models/Membership';

export async function requireDashboardAccess(
  siteId: string,
  permission?: StaffPermission,
): Promise<{ session: AuthenticatedSession; access: SiteAccess }> {
  await connectToDatabase();
  const token = (await cookies()).get(sessionCookieName('platform'))?.value;
  const session = await validateSessionToken(token, 'platform');
  if (!session) redirect('/login');

  try {
    const access = await requireSiteAccess(session, siteId, ['owner', 'staff']);
    if (permission) assertPermission(access, permission);
    return { session, access };
  } catch {
    notFound();
  }
}

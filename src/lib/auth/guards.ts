/**
 * Authorisation guards.
 *
 * Every guard throws rather than returning a boolean. A forgotten `if` around a
 * boolean check silently grants access; a forgotten `await` around a throwing
 * guard fails loudly in tests.
 */

import type { Types } from 'mongoose';
import { Membership, type SiteRole, type StaffPermission } from '../db/models/Membership';
import { Site, type SiteDocument } from '../db/models/Site';
import { ForbiddenError, NotFoundError } from '../errors';
import type { AuthenticatedSession } from './session';

export function assertPlatformAdmin(session: AuthenticatedSession): void {
  if (session.user.platformRole !== 'admin') {
    throw new ForbiddenError(
      `User ${String(session.user._id)} is not a platform admin`,
    );
  }
}

export interface SiteAccess {
  site: SiteDocument;
  role: SiteRole | 'platform_admin';
  permissions: StaffPermission[];
}

/**
 * Resolve what this user may do on this site.
 *
 * Platform admins pass without a Membership row, but the returned role says
 * `platform_admin` so callers and audit logs can tell the two apart.
 */
export async function requireSiteAccess(
  session: AuthenticatedSession,
  siteId: Types.ObjectId | string,
  allowedRoles: SiteRole[] = ['owner', 'staff'],
): Promise<SiteAccess> {
  const site = await Site.findById(siteId);
  if (!site) throw new NotFoundError('Site');

  if (session.user.platformRole === 'admin') {
    return { site, role: 'platform_admin', permissions: [] };
  }

  const membership = await Membership.findOne({
    userId: session.user._id,
    siteId: site._id,
  });

  if (!membership) {
    throw new ForbiddenError(
      `User ${String(session.user._id)} has no membership on site ${String(site._id)}`,
    );
  }

  if (!allowedRoles.includes(membership.role)) {
    throw new ForbiddenError(
      `Role ${membership.role} is not permitted here (requires ${allowedRoles.join(' or ')})`,
    );
  }

  return { site, role: membership.role, permissions: membership.permissions };
}

/** Owners hold every permission implicitly; staff hold only what was granted. */
export function assertPermission(access: SiteAccess, permission: StaffPermission): void {
  if (access.role === 'owner' || access.role === 'platform_admin') return;
  if (!access.permissions.includes(permission)) {
    throw new ForbiddenError(`Missing permission: ${permission}`);
  }
}

/** Payout details are owner-only. Staff never touch where the money goes. */
export async function requireSiteOwner(
  session: AuthenticatedSession,
  siteId: Types.ObjectId | string,
): Promise<SiteAccess> {
  return requireSiteAccess(session, siteId, ['owner']);
}

/**
 * The store's actual owner — and nobody else, platform admins included.
 *
 * For where the money goes. requireSiteOwner lets a platform admin through
 * (useful for support reads); this does not, so no admin account, stolen or
 * otherwise, can point a seller's payouts at a different bank account.
 */
export async function requireOwnerMembership(
  session: AuthenticatedSession,
  siteId: Types.ObjectId | string,
): Promise<SiteAccess> {
  const site = await Site.findById(siteId);
  if (!site) throw new NotFoundError('Site');

  const membership = await Membership.findOne({ userId: session.user._id, siteId: site._id, role: 'owner' });
  if (!membership) {
    throw new ForbiddenError(
      `User ${String(session.user._id)} is not the owner of site ${String(site._id)}`,
      'Only the store owner can change where its money is paid.',
    );
  }
  return { site, role: 'owner', permissions: membership.permissions };
}

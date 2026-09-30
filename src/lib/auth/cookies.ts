/**
 * Session cookie policy.
 *
 * THE RULE: never set a Domain attribute.
 *
 * A cookie scoped to `.hordemart.com` is sent to every tenant subdomain. Since
 * sellers control the content served on their own subdomain, such a cookie hands
 * every seller a copy of the dashboard session of any logged-in visitor. Omitting
 * Domain yields a host-only cookie, which is the isolation boundary this whole
 * architecture depends on.
 */

import type { SessionScope } from '../db/models/Session';
import { SESSION_TTL_MS } from './session';

/**
 * Distinct names per scope so a storefront cookie and a dashboard cookie cannot
 * be confused for one another if they ever reach the same host.
 */
export const PLATFORM_SESSION_COOKIE = '__Host-hm_session';
export const STOREFRONT_SESSION_COOKIE = 'hm_shop_session';

export function sessionCookieName(scope: SessionScope): string {
  return scope === 'platform' ? PLATFORM_SESSION_COOKIE : STOREFRONT_SESSION_COOKIE;
}

export interface CookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax' | 'strict';
  path: string;
  maxAge: number;
  // `domain` is intentionally absent from this type. See the module comment.
}

export function sessionCookieOptions(
  scope: SessionScope,
  isProduction = process.env.NODE_ENV === 'production',
): CookieOptions {
  return {
    httpOnly: true,
    // The __Host- prefix is only honoured when Secure is set and Path is "/",
    // so in production the browser itself enforces the host-only guarantee.
    secure: isProduction,
    // Storefront checkout returns from Paystack via a top-level redirect, which
    // a Strict cookie would not accompany, logging the customer out mid-purchase.
    sameSite: scope === 'platform' ? 'strict' : 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}

export function clearedCookieOptions(scope: SessionScope): CookieOptions {
  return { ...sessionCookieOptions(scope), maxAge: 0 };
}

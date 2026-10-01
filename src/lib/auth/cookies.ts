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
 *
 * That rule is enforced here in code: `CookieOptions` has no `domain` field, so
 * there is nothing to set. The `__Host-` prefix is the browser enforcing the
 * same thing on our behalf — belt as well as braces — and it is only available
 * where the cookie is also Secure.
 */

import type { SessionScope } from '../db/models/Session';
import { SESSION_TTL_MS } from './session';

/**
 * Whether cookies are being issued over HTTPS.
 *
 * Not simply "is this production": it is the single fact that decides BOTH the
 * Secure attribute and whether the `__Host-` prefix may be used, and those two
 * must agree. Keeping it in one function is what stops them drifting apart —
 * which is exactly how the bug below happened.
 */
function isSecureContext(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === 'production';
}

/**
 * The platform (dashboard) cookie name.
 *
 * `__Host-hm_session` over HTTPS, plain `hm_session` otherwise.
 *
 * WHY IT IS CONDITIONAL. The `__Host-` prefix is not advisory: a browser
 * REJECTS a cookie carrying it unless the cookie is also Secure, has Path=/,
 * and has no Domain. In development the app serves plain http, so Secure is
 * off — and the cookie was therefore thrown away by the browser rather than
 * merely losing its extra enforcement.
 *
 * The visible symptom was that signing up appeared to work and then returned
 * you to the signup page: the account and site were created, the session row
 * was written, the Set-Cookie header went out, the browser discarded it, and
 * the dashboard redirected an apparently-anonymous visitor back to /login.
 * Nothing logged an error, because nothing had failed.
 *
 * Dropping the prefix in development loses the browser's enforcement, not the
 * property itself — we still never set Domain, and development is http-only
 * where `__Host-` cannot apply in any case. Production is unchanged.
 *
 * Secure cookies are also refused outright over http on any host other than
 * localhost, so forcing Secure on in development would break
 * `hordemart.local` too; TLS for a local dev host is not a trade worth making
 * to keep a prefix whose guarantee we already implement in code.
 */
export function platformSessionCookieName(env: NodeJS.ProcessEnv = process.env): string {
  return isSecureContext(env) ? '__Host-hm_session' : 'hm_session';
}

/**
 * The storefront cookie has never carried the prefix.
 *
 * A storefront session is deliberately a different name from the platform one,
 * so the two cannot be mistaken for each other if they ever reach the same
 * host. See models/Session.ts: they also resolve against different collections.
 */
export const STOREFRONT_SESSION_COOKIE = 'hm_shop_session';

export function sessionCookieName(
  scope: SessionScope,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return scope === 'platform' ? platformSessionCookieName(env) : STOREFRONT_SESSION_COOKIE;
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
  isProduction = isSecureContext(),
): CookieOptions {
  return {
    httpOnly: true,
    // Must agree with platformSessionCookieName: the prefix is only legal when
    // this is true, and a disagreement means a cookie the browser discards.
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

/**
 * Retained for the production name so tests and docs can refer to it directly.
 * Prefer `sessionCookieName('platform')`, which is correct in both contexts.
 */
export const PLATFORM_SESSION_COOKIE_SECURE = '__Host-hm_session';

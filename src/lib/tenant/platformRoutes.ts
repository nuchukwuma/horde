/**
 * Which HordeMart host a platform page belongs on, and where to send a
 * request that arrived on the wrong one. Pure and Edge-safe: middleware runs
 * it before anything else.
 *
 *   www.<root>   → the apex, same path. People type "www." out of habit, and
 *                  "www" is a reserved store name, so without this it was a
 *                  404 on the most-typed address there is.
 *   <root>       → marketing pages only. Sign-in, sign-up, email
 *                  verification and the dashboard move to the app host:
 *                  session cookies are host-only (__Host- in production), so
 *                  signing in on the apex left the seller with a session the
 *                  dashboard host could not see — and the apex CSP does not
 *                  allow photo uploads to Cloudinary.
 *   <app host> / → the dashboard; the app host has no marketing page.
 */

export interface PlatformHosts {
  /** ROOT_DOMAIN, with port in development. */
  rootDomain: string;
  /** APP_HOST, with port in development. */
  appHost: string;
}

/** Paths that only make sense on the app host. */
const APP_ONLY = ['/login', '/signup', '/verify-email', '/dashboard'];

function isAppOnly(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  return APP_ONLY.some((path) => lower === path || lower.startsWith(`${path}/`));
}

function bare(host: string): string {
  return host.trim().toLowerCase().split(':')[0]?.replace(/\.$/, '') ?? '';
}

/**
 * The host and path a request should be redirected to, or null to serve it
 * where it is. `host` is the request's Host header.
 */
export function platformRedirect(
  host: string | null | undefined,
  pathname: string,
  hosts: PlatformHosts,
): { host: string; pathname: string } | null {
  if (!host) return null;
  const requested = bare(host);
  const root = bare(hosts.rootDomain);
  const app = bare(hosts.appHost);

  if (requested === `www.${root}`) return { host: hosts.rootDomain, pathname };
  if (requested === root && isAppOnly(pathname)) return { host: hosts.appHost, pathname };
  if (requested === app && pathname === '/') return { host: hosts.appHost, pathname: '/dashboard' };
  return null;
}

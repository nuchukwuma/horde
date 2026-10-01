/**
 * Edge middleware: host → tenant slug.
 *
 * Runs on the Edge runtime, so it does host parsing only — Mongoose cannot load
 * here. Resolving the slug to a Site happens in Node-runtime code via
 * `withSiteBySlug`.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { resolveHost } from './lib/tenant/resolveHost';
import {
  STOREFRONT_PATH_PREFIX,
  TENANT_CUSTOM_DOMAIN_HEADER,
  TENANT_HOST_HEADER,
  TENANT_SLUG_HEADER,
} from './lib/tenant/headers';
import { adsenseClient, buildCsp, generateNonce } from './lib/security/csp';

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};

type HostKind = 'apex' | 'app' | 'tenant' | 'custom-domain' | 'invalid';

/**
 * The host-appropriate CSP, carrying this request's nonce.
 *
 * next.config.mjs still sets a strict policy as a static baseline, so a
 * request that somehow bypasses middleware gets the tenant-safe headers rather
 * than none. This overwrites it where the host is known — which is only here,
 * since next.config cannot see the Host header.
 */
function policyFor(hostKind: HostKind, nonce: string): string {
  return buildCsp({
    hostKind,
    isDev: process.env.NODE_ENV !== 'production',
    adsEnabled: adsenseClient() !== null,
    nonce,
  });
}

function withCsp(response: NextResponse, policy: string): NextResponse {
  response.headers.set('Content-Security-Policy', policy);
  return response;
}

/**
 * The internal storefront tree, addressed directly.
 *
 * Only a rewrite from a tenant host may reach it. Requested by path on the
 * apex or app host it would render seller content on a platform origin — the
 * one place seller HTML must never appear.
 */
function isInternalStorefrontPath(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  return lower === STOREFRONT_PATH_PREFIX || lower.startsWith(`${STOREFRONT_PATH_PREFIX}/`);
}

export function middleware(request: NextRequest): NextResponse {
  const rootDomain = process.env.ROOT_DOMAIN;
  const appHost = process.env.APP_HOST;

  const nonce = generateNonce();

  if (!rootDomain || !appHost) {
    // Misconfiguration must not silently degrade into "everything is the apex".
    return withCsp(
      new NextResponse('Server misconfigured', { status: 500 }),
      policyFor('invalid', nonce),
    );
  }

  const requestHeaders = new Headers(request.headers);

  // A client can send any header it likes. If these survived, a request to the
  // apex could claim to be any tenant, and downstream code would believe it.
  requestHeaders.delete(TENANT_SLUG_HEADER);
  requestHeaders.delete(TENANT_HOST_HEADER);
  requestHeaders.delete(TENANT_CUSTOM_DOMAIN_HEADER);

  const resolved = resolveHost(request.headers.get('host'), { rootDomain, appHost });
  const policy = policyFor(resolved.kind, nonce);

  // Next.js reads the nonce from the request's own CSP header and stamps it on
  // every script it emits. Without this line the response header names a nonce
  // that no script carries, and the page is blank.
  requestHeaders.set('Content-Security-Policy', policy);

  if (resolved.kind !== 'tenant' && isInternalStorefrontPath(request.nextUrl.pathname)) {
    return withCsp(new NextResponse('Not found', { status: 404 }), policy);
  }

  switch (resolved.kind) {
    case 'invalid':
      return withCsp(new NextResponse('Unknown host', { status: 404 }), policy);

    case 'tenant': {
      const slug = resolved.slug as string;
      requestHeaders.set(TENANT_SLUG_HEADER, slug);
      requestHeaders.set(TENANT_HOST_HEADER, 'tenant');

      // Page requests are rewritten into the tenant page tree so one set of
      // components serves every storefront. API routes, sitemap and robots are
      // left alone: they resolve the tenant from the header themselves and must
      // keep their public paths.
      const { pathname } = request.nextUrl;
      const isSharedPath =
        pathname.startsWith('/api/') ||
        pathname === '/sitemap.xml' ||
        pathname === '/robots.txt';

      if (!isSharedPath) {
        const url = request.nextUrl.clone();
        url.pathname = `${STOREFRONT_PATH_PREFIX}/${slug}${pathname === '/' ? '' : pathname}`;
        return withCsp(
          NextResponse.rewrite(url, { request: { headers: requestHeaders } }),
          policy,
        );
      }
      break;
    }

    case 'custom-domain':
      requestHeaders.set(TENANT_HOST_HEADER, 'custom-domain');
      requestHeaders.set(TENANT_CUSTOM_DOMAIN_HEADER, resolved.domain as string);
      break;

    case 'app':
    case 'apex':
      requestHeaders.set(TENANT_HOST_HEADER, resolved.kind);
      break;
  }

  return withCsp(NextResponse.next({ request: { headers: requestHeaders } }), policy);
}

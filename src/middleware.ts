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
  TENANT_CUSTOM_DOMAIN_HEADER,
  TENANT_HOST_HEADER,
  TENANT_SLUG_HEADER,
} from './lib/tenant/headers';
import { adsenseClient, buildCsp } from './lib/security/csp';

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};

/**
 * Apply the host-appropriate CSP.
 *
 * next.config.mjs still sets a strict policy as a static baseline, so a
 * request that somehow bypasses middleware gets the tenant-safe headers rather
 * than none. This overwrites it where the host is known — which is only here,
 * since next.config cannot see the Host header.
 */
function withCsp(
  response: NextResponse,
  hostKind: 'apex' | 'app' | 'tenant' | 'custom-domain' | 'invalid',
): NextResponse {
  response.headers.set(
    'Content-Security-Policy',
    buildCsp({
      hostKind,
      isDev: process.env.NODE_ENV !== 'production',
      adsEnabled: adsenseClient() !== null,
    }),
  );
  return response;
}

export function middleware(request: NextRequest): NextResponse {
  const rootDomain = process.env.ROOT_DOMAIN;
  const appHost = process.env.APP_HOST;

  if (!rootDomain || !appHost) {
    // Misconfiguration must not silently degrade into "everything is the apex".
    return withCsp(new NextResponse('Server misconfigured', { status: 500 }), 'invalid');
  }

  const requestHeaders = new Headers(request.headers);

  // A client can send any header it likes. If these survived, a request to the
  // apex could claim to be any tenant, and downstream code would believe it.
  requestHeaders.delete(TENANT_SLUG_HEADER);
  requestHeaders.delete(TENANT_HOST_HEADER);
  requestHeaders.delete(TENANT_CUSTOM_DOMAIN_HEADER);

  const resolved = resolveHost(request.headers.get('host'), { rootDomain, appHost });

  switch (resolved.kind) {
    case 'invalid':
      return withCsp(new NextResponse('Unknown host', { status: 404 }), 'invalid');

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
        url.pathname = `/_sites/${slug}${pathname === '/' ? '' : pathname}`;
        return withCsp(
          NextResponse.rewrite(url, { request: { headers: requestHeaders } }),
          'tenant',
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

  return withCsp(
    NextResponse.next({ request: { headers: requestHeaders } }),
    resolved.kind,
  );
}

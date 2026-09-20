/**
 * Edge middleware: host → tenant slug.
 *
 * Runs on the Edge runtime, so it does host parsing only — Mongoose cannot load
 * here. Resolving the slug to a Site happens in Node-runtime code via
 * `withSiteBySlug`.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { resolveHost } from './lib/tenant/resolveHost';
import { TENANT_HOST_HEADER, TENANT_SLUG_HEADER } from './lib/tenant/loadSite';

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};

export function middleware(request: NextRequest): NextResponse {
  const rootDomain = process.env.ROOT_DOMAIN;
  const appHost = process.env.APP_HOST;

  if (!rootDomain || !appHost) {
    // Misconfiguration must not silently degrade into "everything is the apex".
    return new NextResponse('Server misconfigured', { status: 500 });
  }

  const requestHeaders = new Headers(request.headers);

  // A client can send any header it likes. If these survived, a request to the
  // apex could claim to be any tenant, and downstream code would believe it.
  requestHeaders.delete(TENANT_SLUG_HEADER);
  requestHeaders.delete(TENANT_HOST_HEADER);

  const resolved = resolveHost(request.headers.get('host'), { rootDomain, appHost });

  switch (resolved.kind) {
    case 'invalid':
      return new NextResponse('Unknown host', { status: 404 });

    case 'tenant':
      requestHeaders.set(TENANT_SLUG_HEADER, resolved.slug as string);
      requestHeaders.set(TENANT_HOST_HEADER, 'tenant');
      break;

    case 'custom-domain':
      requestHeaders.set(TENANT_HOST_HEADER, 'custom-domain');
      requestHeaders.set('x-hm-custom-domain', resolved.domain as string);
      break;

    case 'app':
    case 'apex':
      requestHeaders.set(TENANT_HOST_HEADER, resolved.kind);
      break;
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

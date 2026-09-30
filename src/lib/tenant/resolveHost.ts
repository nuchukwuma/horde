/**
 * Host → tenant resolution.
 *
 * Edge-safe and pure: no Node built-ins, no database. Middleware runs on the Edge
 * runtime where Mongoose cannot load, so this only decides *which* slug a request
 * is for. Loading the Site document happens later, in Node-runtime code.
 */

import { isReservedSlug, normalizeSlug, validateSlug } from './reserved';

export type HostKind =
  | 'app'
  | 'apex'
  | 'tenant'
  | 'custom-domain'
  | 'invalid';

export interface ResolvedHost {
  kind: HostKind;
  /** Tenant slug, present only when kind === 'tenant'. */
  slug?: string;
  /** Full custom domain, present only when kind === 'custom-domain'. */
  domain?: string;
  hostname: string;
}

export interface HostConfig {
  /** Apex the tenant subdomains hang off, e.g. "hordemart.com". */
  rootDomain: string;
  /** Host serving the seller/admin dashboard, e.g. "app.hordemart.com". */
  appHost: string;
}

/** Strips the port and any trailing dot, lowercases. */
export function normalizeHostname(host: string): string {
  const withoutPort = host.trim().toLowerCase().split(':')[0] ?? '';
  return withoutPort.replace(/\.$/, '');
}

export function resolveHost(host: string | null | undefined, config: HostConfig): ResolvedHost {
  if (!host) return { kind: 'invalid', hostname: '' };

  const hostname = normalizeHostname(host);
  const rootDomain = normalizeHostname(config.rootDomain);
  const appHost = normalizeHostname(config.appHost);

  if (!hostname) return { kind: 'invalid', hostname };

  if (hostname === appHost) return { kind: 'app', hostname };
  if (hostname === rootDomain) return { kind: 'apex', hostname };

  const suffix = `.${rootDomain}`;
  if (hostname.endsWith(suffix)) {
    const label = hostname.slice(0, -suffix.length);

    // Only a single label is a tenant. "a.b.<root>" is not a tenant host, and
    // treating it as one would let "evil.gtbank.<root>" past the reserved check.
    if (label.includes('.')) return { kind: 'invalid', hostname };

    const slug = normalizeSlug(label);
    if (!validateSlug(slug).valid) return { kind: 'invalid', hostname };

    return { kind: 'tenant', slug, hostname };
  }

  // Anything else is either a configured custom domain or noise. Verifying that
  // it maps to a real Site is a database concern, deliberately not done here.
  return { kind: 'custom-domain', domain: hostname, hostname };
}

/** True when the host may not be used as a storefront. */
export function isReservedHost(host: string, config: HostConfig): boolean {
  const resolved = resolveHost(host, config);
  if (resolved.kind !== 'tenant') return true;
  return isReservedSlug(resolved.slug ?? '');
}

export function readHostConfigFromEnv(env: Record<string, string | undefined>): HostConfig {
  const rootDomain = env.ROOT_DOMAIN;
  const appHost = env.APP_HOST;
  if (!rootDomain) throw new Error('ROOT_DOMAIN is not configured');
  if (!appHost) throw new Error('APP_HOST is not configured');
  return { rootDomain, appHost };
}

/**
 * Header names shared between Edge middleware and Node-runtime code.
 *
 * Their own module, with zero imports, on purpose. These constants used to live
 * in loadSite.ts; middleware imported them from there, and that single import
 * pulled the whole Mongoose module graph into the Edge bundle — which fails the
 * build with "Dynamic Code Evaluation not allowed in Edge Runtime".
 *
 * The architecture rule (middleware parses hosts, Node loads Sites) was right;
 * the import boundary quietly broke it. Keep this file dependency-free.
 */

export const TENANT_SLUG_HEADER = 'x-hm-site-slug';
export const TENANT_HOST_HEADER = 'x-hm-host-kind';
export const TENANT_CUSTOM_DOMAIN_HEADER = 'x-hm-custom-domain';

/**
 * Where storefront pages live inside the app tree.
 *
 * Middleware rewrites `ade.hordemart.com/shop` to `/storefront/ade/shop`. The
 * folder used to be `app/_sites`, and a leading underscore makes a folder
 * PRIVATE in the App Router — excluded from routing entirely — so every
 * storefront page was a 404 and nothing reported it. A build's route list is
 * the check: it must show `/storefront/[slug]`.
 *
 * The prefix is never a public URL. Middleware 404s it on every non-tenant
 * host, and the storefront layout refuses to render unless the slug in the
 * path matches the one middleware derived from the Host header.
 */
export const STOREFRONT_PATH_PREFIX = '/storefront';

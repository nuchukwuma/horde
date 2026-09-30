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

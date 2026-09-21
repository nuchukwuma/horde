/**
 * JSON-LD structured data.
 *
 * Every value here originates from seller-authored content, so it must be
 * escaped for embedding in a <script> block. JSON.stringify alone is not
 * enough: the sequence `</script>` inside a string value terminates the block
 * in an HTML parser regardless of JSON syntax, which turns structured data into
 * an XSS vector.
 */

import { canonicalUrl, type SiteIdentity } from './meta';

export interface BlogPostingInput {
  site: SiteIdentity;
  path: string;
  headline: string;
  description?: string;
  imageUrl?: string;
  publishedAt?: Date | null;
  modifiedAt?: Date | null;
  authorName?: string;
}

export function blogPostingJsonLd(input: BlogPostingInput): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: input.headline,
    ...(input.description ? { description: input.description } : {}),
    ...(input.imageUrl ? { image: input.imageUrl } : {}),
    url: canonicalUrl(input.site, input.path),
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl(input.site, input.path) },
    ...(input.publishedAt ? { datePublished: input.publishedAt.toISOString() } : {}),
    ...(input.modifiedAt ? { dateModified: input.modifiedAt.toISOString() } : {}),
    author: { '@type': 'Person', name: input.authorName ?? input.site.name },
    publisher: { '@type': 'Organization', name: input.site.name },
  };
}

export interface CreativeWorkInput {
  site: SiteIdentity;
  path: string;
  name: string;
  description?: string;
  imageUrl?: string;
  completedAt?: Date | null;
}

/** Portfolio projects are CreativeWork, not Article — they are the work itself. */
export function creativeWorkJsonLd(input: CreativeWorkInput): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    ...(input.imageUrl ? { image: input.imageUrl } : {}),
    url: canonicalUrl(input.site, input.path),
    ...(input.completedAt ? { dateCreated: input.completedAt.toISOString() } : {}),
    creator: { '@type': 'Organization', name: input.site.name },
  };
}

export interface Breadcrumb {
  name: string;
  path: string;
}

export function breadcrumbJsonLd(
  site: SiteIdentity,
  crumbs: Breadcrumb[],
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: canonicalUrl(site, crumb.path),
    })),
  };
}

/**
 * U+2028 LINE SEPARATOR and U+2029 PARAGRAPH SEPARATOR.
 *
 * Built with fromCharCode rather than written as literals: they are valid
 * inside a JSON string but terminate a line to a JavaScript parser, so a raw
 * one in this source file breaks the file itself. That happened while writing
 * this module, which is a fair demonstration of why the escaping is needed.
 */
const LINE_SEPARATORS = new RegExp(
  `[${String.fromCharCode(0x2028)}${String.fromCharCode(0x2029)}]`,
  'g',
);

/**
 * Serialise JSON-LD for embedding in a script tag.
 *
 * `<` is escaped so a seller cannot close the script element from inside a
 * string value. The result is still valid JSON: \\u003c is how JSON spells `<`.
 */
export function serializeJsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(LINE_SEPARATORS, (character) =>
      character.charCodeAt(0) === 0x2028 ? '\\u2028' : '\\u2029',
    );
}

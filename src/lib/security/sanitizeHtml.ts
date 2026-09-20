/**
 * HTML sanitisation for seller-authored content.
 *
 * Sanitise on write, not on render. Render-time sanitisation has to be
 * remembered at every call site; write-time means the stored value is already
 * safe no matter who reads it later.
 *
 * This matters more here than on a single-tenant site: a stored XSS on a tenant
 * subdomain runs in an origin that shares a registrable domain with the
 * dashboard. Host-only cookies (see auth/cookies.ts) are the other half of that
 * defence.
 */

import DOMPurify from 'isomorphic-dompurify';

/** Product descriptions and portfolio copy: formatting, links, images. */
const RICH_TEXT_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'blockquote',
  'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'a', 'img', 'figure', 'figcaption', 'code', 'pre', 'hr',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
];

const RICH_TEXT_ATTRS = ['href', 'src', 'alt', 'title', 'width', 'height', 'colspan', 'rowspan'];

/** Short, plain strings such as a site tagline. */
const INLINE_TAGS = ['strong', 'b', 'em', 'i', 'br'];

export function sanitizeRichText(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: RICH_TEXT_TAGS,
    ALLOWED_ATTR: RICH_TEXT_ATTRS,
    // Blocks javascript:, data:, and vbscript: URLs in href/src.
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|#|\/)/i,
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'input'],
    FORBID_ATTR: ['style', 'srcset', 'formaction', 'form'],
    // Keeps <svg> and MathML out entirely; both carry their own script vectors.
    USE_PROFILES: { html: true },
  });
}

export function sanitizeInline(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: INLINE_TAGS,
    ALLOWED_ATTR: [],
  });
}

export function stripAllHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}

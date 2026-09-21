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

/**
 * Strip `data:` URLs from src/href.
 *
 * This needs a hook rather than configuration. DOMPurify keeps an internal
 * DATA_URI_TAGS set (img, audio, video, source, …) and permits `data:` on those
 * elements' src EVEN WHEN ALLOWED_URI_REGEXP forbids it — the regexp check is
 * skipped for that specific case, and no option turns it off.
 *
 * Found by a test asserting that `<img src="data:text/html;base64,...">` was
 * removed. It was not, against a configuration that read as though it would be.
 *
 * Blocking it costs nothing here: images go through Cloudinary, and the CSP
 * img-src allowlist would refuse to render a data: image anyway.
 */
const DATA_URI_ATTRIBUTES = ['src', 'href', 'xlink:href'];

declare global {
  var __hordemartPurifyHook: boolean | undefined;
}

if (!globalThis.__hordemartPurifyHook) {
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    const element = node as unknown as {
      getAttribute?: (name: string) => string | null;
      removeAttribute?: (name: string) => void;
    };
    if (!element.getAttribute || !element.removeAttribute) return;

    for (const attribute of DATA_URI_ATTRIBUTES) {
      const value = element.getAttribute(attribute);
      // Leading whitespace and control characters are ignored by browsers when
      // resolving a URL, so they must be ignored here too.
      if (value && /^[\s\u0000-\u001f]*data:/i.test(value)) {
        element.removeAttribute(attribute);
      }
    }
  });
  globalThis.__hordemartPurifyHook = true;
}

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

/**
 * Allowed URL schemes for href and src.
 *
 * Note `data:` is absent. A data: URL in an img src is a content-injection
 * vector and defeats the CSP img-src allowlist; there is no legitimate reason
 * for seller content to carry one when images go through Cloudinary.
 */
const SAFE_URI = /^(?:https?:|mailto:|tel:|#|\/)/i;

export function sanitizeRichText(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: RICH_TEXT_TAGS,
    ALLOWED_ATTR: RICH_TEXT_ATTRS,
    ALLOWED_URI_REGEXP: SAFE_URI,
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'input', 'base'],
    FORBID_ATTR: ['style', 'srcset', 'formaction', 'form'],
    // USE_PROFILES is deliberately NOT set. DOMPurify treats it as mutually
    // exclusive with ALLOWED_TAGS: setting both silently discards the explicit
    // allowlist above, which is how a data:text/html image source got through
    // an allowlist that appeared to forbid it. Omitting SVG and MathML from
    // ALLOWED_TAGS already keeps both out.
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
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

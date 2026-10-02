/**
 * Per-tenant SEO metadata.
 *
 * The multi-tenant part is what makes this non-obvious: every canonical URL,
 * sitemap entry and JSON-LD `url` must point at the SELLER's host, never the
 * platform's. Getting that wrong would have every tenant's content canonicalise
 * to one domain and compete with itself.
 */

const TITLE_MAX = 60;
const DESCRIPTION_MAX = 160;
const DESCRIPTION_MIN = 120;

export interface SiteIdentity {
  slug: string;
  name: string;
  customDomain?: string | null;
}

/**
 * The public origin for a tenant: its custom domain if set, else its subdomain.
 *
 * Throws when ROOT_DOMAIN is missing rather than interpolating `undefined`.
 * A misconfigured deploy would otherwise emit `http://ade-store.undefined/...`
 * into every canonical tag, sitemap entry and JSON-LD block — silently, and in
 * the one part of the system where being silently wrong is most expensive to
 * discover.
 */
export function siteOrigin(site: SiteIdentity, rootDomain = process.env.ROOT_DOMAIN): string {
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';

  if (site.customDomain) return `${protocol}://${site.customDomain}`;

  if (!rootDomain) {
    throw new Error(
      'ROOT_DOMAIN is not configured; refusing to build a canonical URL with an undefined host',
    );
  }

  return `${protocol}://${site.slug}.${rootDomain}`;
}

/** HordeMart's own apex origin, for "made with" links and the like. */
export function platformOrigin(rootDomain = process.env.ROOT_DOMAIN): string {
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  return `${protocol}://${rootDomain ?? 'hordemart.com'}`;
}

/**
 * The dashboard host's origin, from APP_HOST — for links in emails.
 *
 * Never from the request: a Host header is whatever the client sent, and a
 * link built from it lets anyone who can trigger an email (a password reset)
 * point the recipient's link at a server they control.
 */
export function appOrigin(appHost = process.env.APP_HOST): string {
  if (!appHost) throw new Error('APP_HOST is not configured; refusing to build an email link');
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  return `${protocol}://${appHost}`;
}

/**
 * An absolute, self-consistent canonical URL.
 *
 * Always built from the site's own origin, so a post reachable at both the
 * subdomain and a custom domain declares one preferred address rather than
 * letting the two compete.
 */
export function canonicalUrl(site: SiteIdentity, path: string): string {
  const normalised = path.startsWith('/') ? path : `/${path}`;
  // No trailing slash except at the root, so /blog and /blog/ do not become two
  // URLs with the same content.
  const trimmed = normalised.length > 1 ? normalised.replace(/\/+$/, '') : normalised;
  return `${siteOrigin(site)}${trimmed}`;
}

export interface PageMeta {
  title: string;
  description: string;
  canonical: string;
  noindex: boolean;
  /** Present when the page has an image worth showing in a share card. */
  imageUrl?: string;
}

export interface BuildMetaInput {
  site: SiteIdentity;
  path: string;
  title: string;
  /** Falls back to an excerpt or summary when no meta description was written. */
  description?: string;
  fallbackDescription?: string;
  imageUrl?: string;
  noindex?: boolean;
}

/**
 * Build the metadata for a page.
 *
 * Titles are truncated at a word boundary rather than mid-word: a title cut to
 * "Ankara Shirts for the Har…" reads as broken, which costs more clicks than
 * the missing words.
 */
export function buildPageMeta(input: BuildMetaInput): PageMeta {
  const suffix = ` | ${input.site.name}`;
  const titleRoom = TITLE_MAX - suffix.length;

  const title =
    input.title.length <= titleRoom
      ? `${input.title}${suffix}`
      : `${truncateAtWord(input.title, titleRoom)}${suffix}`;

  const rawDescription = input.description?.trim() || input.fallbackDescription?.trim() || '';

  return {
    title,
    description: truncateAtWord(stripTags(rawDescription), DESCRIPTION_MAX),
    canonical: canonicalUrl(input.site, input.path),
    noindex: input.noindex ?? false,
    imageUrl: input.imageUrl,
  };
}

/**
 * Whether a description is in the range search engines tend to show in full.
 *
 * Advisory, surfaced to the seller as a hint. Never enforced — refusing to
 * publish a post over a description length would be absurd.
 */
export function describeMetaQuality(description: string): {
  ok: boolean;
  hint?: string;
} {
  const length = description.trim().length;

  if (length === 0) {
    return { ok: false, hint: 'Add a meta description so search results show your own words.' };
  }
  if (length < DESCRIPTION_MIN) {
    return {
      ok: false,
      hint: `Meta description is ${length} characters; around ${DESCRIPTION_MIN}–${DESCRIPTION_MAX} shows best.`,
    };
  }
  if (length > DESCRIPTION_MAX) {
    return {
      ok: false,
      hint: `Meta description is ${length} characters and will be cut off after about ${DESCRIPTION_MAX}.`,
    };
  }

  return { ok: true };
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function truncateAtWord(value: string, max: number): string {
  if (value.length <= max) return value;

  const cut = value.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');

  // If there is no space at all, a hard cut is the only option.
  return lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut;
}

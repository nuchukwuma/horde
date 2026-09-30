/**
 * Content slugs.
 *
 * Different rules from tenant subdomains: these are path segments, so they may
 * be longer and there is no reserved-name or phishing concern. What matters is
 * that they are stable, readable, and unique within a site.
 */

const MAX_SLUG_LENGTH = 120;

/**
 * Derive a URL slug from a title.
 *
 * Unicode is normalised and stripped of diacritics so "Àdìrẹ̀ Fabric" becomes
 * "adire-fabric" rather than percent-encoded mush in the address bar. The text
 * itself is preserved in the title; this is only the URL.
 */
export function slugify(input: string): string {
  const base = input
    .normalize('NFKD')
    // Combining marks, left behind by NFKD after splitting accented characters.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');

  return base;
}

/**
 * A slug guaranteed non-empty.
 *
 * A title of only emoji or only CJK characters slugifies to an empty string,
 * and an empty slug would collide with the index route. Falling back to a
 * timestamp keeps the URL working even when it is not pretty.
 */
export function slugifyOrFallback(input: string, fallbackPrefix = 'post'): string {
  const slug = slugify(input);
  return slug || `${fallbackPrefix}-${Date.now().toString(36)}`;
}

/**
 * Make a slug unique within a site by appending a counter.
 *
 * `exists` is injected so this stays pure and testable rather than reaching for
 * a model itself.
 */
export async function uniqueSlug(
  desired: string,
  exists: (candidate: string) => Promise<boolean>,
  maxAttempts = 50,
): Promise<string> {
  if (!(await exists(desired))) return desired;

  for (let suffix = 2; suffix <= maxAttempts; suffix += 1) {
    const candidate = `${desired.slice(0, MAX_SLUG_LENGTH - 5)}-${suffix}`;
    if (!(await exists(candidate))) return candidate;
  }

  // Rather than loop forever on a pathological case, fall back to something
  // certainly unique. The unique index is still the real guarantee.
  return `${desired.slice(0, MAX_SLUG_LENGTH - 10)}-${Date.now().toString(36)}`;
}

/** Rough reading time, used for list views. Not worth being clever about. */
export function estimateReadingMinutes(html: string, wordsPerMinute = 200): number {
  const words = html
    .replace(/<[^>]*>/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  return Math.max(1, Math.round(words / wordsPerMinute));
}

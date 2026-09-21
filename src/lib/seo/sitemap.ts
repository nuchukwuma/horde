/**
 * Per-tenant sitemap and robots.txt.
 *
 * Each seller gets their own, served from their own host. A single
 * platform-wide sitemap would be wrong in both directions: it would leak the
 * full tenant list to anyone who fetched it, and search engines largely ignore
 * sitemap entries for hosts other than the one serving the file.
 */

import { canonicalUrl, siteOrigin, type SiteIdentity } from './meta';

export interface SitemapEntry {
  path: string;
  lastModified?: Date | null;
  changeFrequency?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  priority?: number;
}

/** XML text escaping. A seller's slug cannot break the document. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildSitemap(site: SiteIdentity, entries: SitemapEntry[]): string {
  const urls = entries
    .map((entry) => {
      const parts = [`    <loc>${escapeXml(canonicalUrl(site, entry.path))}</loc>`];

      if (entry.lastModified) {
        parts.push(`    <lastmod>${entry.lastModified.toISOString().slice(0, 10)}</lastmod>`);
      }
      if (entry.changeFrequency) {
        parts.push(`    <changefreq>${entry.changeFrequency}</changefreq>`);
      }
      if (entry.priority !== undefined) {
        parts.push(`    <priority>${entry.priority.toFixed(1)}</priority>`);
      }

      return `  <url>\n${parts.join('\n')}\n  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

export interface RobotsOptions {
  /** Suspended and unverified sites should not be indexed at all. */
  disallowAll?: boolean;
}

export function buildRobots(site: SiteIdentity, options: RobotsOptions = {}): string {
  if (options.disallowAll) {
    return 'User-agent: *\nDisallow: /\n';
  }

  return [
    'User-agent: *',
    'Allow: /',
    // Nothing under these is a search result worth having, and /api/ in
    // particular would waste crawl budget on JSON.
    'Disallow: /api/',
    'Disallow: /checkout',
    'Disallow: /cart',
    'Disallow: /account',
    '',
    `Sitemap: ${siteOrigin(site)}/sitemap.xml`,
    '',
  ].join('\n');
}

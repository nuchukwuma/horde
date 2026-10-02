/**
 * Per-tenant sitemap and robots.txt.
 *
 * Each seller gets their own, served from their own host. A single
 * platform-wide sitemap would be wrong in both directions: it would leak the
 * full tenant list to anyone who fetched it, and search engines largely ignore
 * sitemap entries for hosts other than the one serving the file.
 */

import { platformOrigin, canonicalUrl, siteOrigin, type SiteIdentity } from './meta';

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

/**
 * robots.txt for HordeMart's own hosts. The marketing site (apex) is meant to
 * be found; the app host is sign-in and dashboards, which must not be.
 */
export function buildPlatformRobots(hostKind: 'apex' | 'app', origin = platformOrigin()): string {
  if (hostKind === 'app') return 'User-agent: *\nDisallow: /\n';
  return ['User-agent: *', 'Allow: /', 'Disallow: /api/', '', `Sitemap: ${origin}/sitemap.xml`, ''].join('\n');
}

/** The marketing site's public pages. */
export const PLATFORM_PAGES: SitemapEntry[] = [
  { path: '/', changeFrequency: 'weekly', priority: 1 },
  { path: '/docs', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/terms', changeFrequency: 'yearly', priority: 0.2 },
  { path: '/privacy', changeFrequency: 'yearly', priority: 0.2 },
];

export function buildPlatformSitemap(entries: SitemapEntry[] = PLATFORM_PAGES, origin = platformOrigin()): string {
  const urls = entries
    .map((entry) => {
      const parts = [`    <loc>${escapeXml(`${origin}${entry.path === '/' ? '/' : entry.path}`)}</loc>`];
      if (entry.changeFrequency) parts.push(`    <changefreq>${entry.changeFrequency}</changefreq>`);
      if (entry.priority !== undefined) parts.push(`    <priority>${entry.priority.toFixed(1)}</priority>`);
      return `  <url>\n${parts.join('\n')}\n  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

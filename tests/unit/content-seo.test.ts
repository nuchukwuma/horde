/**
 * Slugs, module gating, and per-tenant SEO.
 *
 * The canonical-URL tests are the multi-tenant ones that matter: every SEO URL
 * must point at the SELLER's host. Getting that wrong would have every tenant's
 * content canonicalise to the platform domain and compete with itself.
 */

import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import {
  estimateReadingMinutes,
  slugify,
  slugifyOrFallback,
  uniqueSlug,
} from '../../src/lib/content/slug';
import {
  buildPageMeta,
  canonicalUrl,
  describeMetaQuality,
  siteOrigin,
} from '../../src/lib/seo/meta';
import { blogPostingJsonLd, breadcrumbJsonLd, serializeJsonLd } from '../../src/lib/seo/jsonLd';
import { buildRobots, buildSitemap } from '../../src/lib/seo/sitemap';
import { assertModuleEnabled, isModuleEnabled } from '../../src/lib/content/modules';
import { Site, type SiteDocument } from '../../src/lib/db/models/Site';
import { NotFoundError } from '../../src/lib/errors';

const site = { slug: 'ade-store', name: 'Ade Stores' };
const ROOT = 'hordemart.com';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Ankara Shirts For Summer')).toBe('ankara-shirts-for-summer');
  });

  it('strips diacritics rather than percent-encoding them', () => {
    // "Àdìrẹ̀ Fabric" should read as adire-fabric in the address bar.
    expect(slugify('Àdìrẹ̀ Fabric')).toBe('adire-fabric');
  });

  it('drops apostrophes instead of turning them into hyphens', () => {
    expect(slugify("Ade's Store")).toBe('ades-store');
  });

  it('collapses runs of punctuation', () => {
    expect(slugify('Shirts --- & --- Trousers')).toBe('shirts-trousers');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('  !!Hello!!  ')).toBe('hello');
  });

  it('caps length without leaving a trailing hyphen', () => {
    const slug = slugify('word '.repeat(100));
    expect(slug.length).toBeLessThanOrEqual(120);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('returns empty for input with nothing sluggable', () => {
    expect(slugify('🎉🎉🎉')).toBe('');
  });
});

describe('slugifyOrFallback', () => {
  it('never returns empty, because an empty slug collides with the index route', () => {
    const slug = slugifyOrFallback('🎉🎉🎉', 'post');
    expect(slug).not.toBe('');
    expect(slug.startsWith('post-')).toBe(true);
  });

  it('uses the real slug when there is one', () => {
    expect(slugifyOrFallback('Real Title')).toBe('real-title');
  });
});

describe('uniqueSlug', () => {
  it('returns the desired slug when free', async () => {
    expect(await uniqueSlug('shirts', async () => false)).toBe('shirts');
  });

  it('appends a counter when taken', async () => {
    const taken = new Set(['shirts']);
    expect(await uniqueSlug('shirts', async (c) => taken.has(c))).toBe('shirts-2');
  });

  it('keeps counting past several collisions', async () => {
    const taken = new Set(['shirts', 'shirts-2', 'shirts-3']);
    expect(await uniqueSlug('shirts', async (c) => taken.has(c))).toBe('shirts-4');
  });

  it('gives up on a pathological case rather than looping forever', async () => {
    const slug = await uniqueSlug('shirts', async () => true, 5);
    expect(slug).toMatch(/^shirts-/);
  });
});

describe('estimateReadingMinutes', () => {
  it('ignores markup when counting words', () => {
    const html = `<p>${'word '.repeat(200)}</p>`;
    expect(estimateReadingMinutes(html)).toBe(1);
  });

  it('scales with length', () => {
    expect(estimateReadingMinutes('word '.repeat(1_000))).toBe(5);
  });

  it('never returns zero', () => {
    expect(estimateReadingMinutes('')).toBe(1);
    expect(estimateReadingMinutes('<p></p>')).toBe(1);
  });
});

describe('canonical URLs point at the seller, not the platform', () => {
  it('builds from the tenant subdomain', () => {
    expect(canonicalUrl(site, '/blog/shirts')).toBe('http://ade-store.hordemart.com/blog/shirts');
  });

  it('prefers a custom domain when set', () => {
    const withDomain = { ...site, customDomain: 'adestores.ng' };
    expect(canonicalUrl(withDomain, '/blog/shirts')).toBe('http://adestores.ng/blog/shirts');
  });

  it('normalises a missing leading slash', () => {
    expect(canonicalUrl(site, 'blog')).toBe('http://ade-store.hordemart.com/blog');
  });

  it('strips a trailing slash so /blog and /blog/ are not two URLs', () => {
    expect(canonicalUrl(site, '/blog/')).toBe('http://ade-store.hordemart.com/blog');
  });

  it('keeps the root slash', () => {
    expect(canonicalUrl(site, '/')).toBe('http://ade-store.hordemart.com/');
  });

  it('builds an origin without a path', () => {
    expect(siteOrigin(site, ROOT)).toBe('http://ade-store.hordemart.com');
  });

  it('refuses to build a URL with an undefined host', () => {
    // Without this guard a misconfigured deploy emits
    // http://ade-store.undefined/... into every canonical tag and sitemap
    // entry, silently, where it is expensive to notice.
    //
    // Passing '' rather than undefined: undefined triggers the default
    // parameter, which reads the env var the test setup provides.
    expect(() => siteOrigin(site, '')).toThrow(/ROOT_DOMAIN/);
  });

  it('still works from a custom domain when no root domain is configured', () => {
    const withDomain = { ...site, customDomain: 'adestores.ng' };
    expect(siteOrigin(withDomain, '')).toBe('http://adestores.ng');
  });
});

describe('page metadata', () => {
  it('appends the site name to the title', () => {
    const meta = buildPageMeta({ site, path: '/blog/x', title: 'Ankara Shirts' });
    expect(meta.title).toBe('Ankara Shirts | Ade Stores');
  });

  it('truncates a long title at a word boundary', () => {
    const meta = buildPageMeta({
      site,
      path: '/blog/x',
      title: 'Ankara Shirts For The Harmattan Season And Everything After That',
    });
    expect(meta.title.length).toBeLessThanOrEqual(60);
    // Cut between words, not mid-word.
    expect(meta.title).not.toMatch(/\w\|/);
  });

  it('falls back to an excerpt when no meta description is set', () => {
    const meta = buildPageMeta({
      site,
      path: '/blog/x',
      title: 'Shirts',
      fallbackDescription: 'A post about shirts.',
    });
    expect(meta.description).toBe('A post about shirts.');
  });

  it('strips markup out of a description', () => {
    const meta = buildPageMeta({
      site,
      path: '/blog/x',
      title: 'Shirts',
      description: '<p>Great <strong>shirts</strong></p>',
    });
    expect(meta.description).toBe('Great shirts');
  });

  it('carries noindex through', () => {
    const meta = buildPageMeta({ site, path: '/x', title: 'T', noindex: true });
    expect(meta.noindex).toBe(true);
  });
});

describe('meta quality hints are advisory, never enforced', () => {
  it('flags a missing description', () => {
    expect(describeMetaQuality('').ok).toBe(false);
  });

  it('flags one that is too short', () => {
    expect(describeMetaQuality('Too short').ok).toBe(false);
  });

  it('flags one that is too long', () => {
    expect(describeMetaQuality('x'.repeat(200)).ok).toBe(false);
  });

  it('accepts one in range', () => {
    expect(describeMetaQuality('x'.repeat(140)).ok).toBe(true);
  });
});

describe('JSON-LD', () => {
  it('builds BlogPosting with an absolute tenant URL', () => {
    const data = blogPostingJsonLd({
      site,
      path: '/blog/shirts',
      headline: 'Shirts',
      publishedAt: new Date('2026-09-21T00:00:00.000Z'),
    });

    expect(data['@type']).toBe('BlogPosting');
    expect(data.url).toBe('http://ade-store.hordemart.com/blog/shirts');
    expect(data.datePublished).toBe('2026-09-21T00:00:00.000Z');
  });

  it('numbers breadcrumb positions from one', () => {
    const data = breadcrumbJsonLd(site, [
      { name: 'Home', path: '/' },
      { name: 'Blog', path: '/blog' },
    ]) as { itemListElement: Array<{ position: number }> };

    expect(data.itemListElement[0].position).toBe(1);
    expect(data.itemListElement[1].position).toBe(2);
  });

  it('escapes < so a seller cannot close the script element', () => {
    // Without this, a post titled `</script><script>alert(1)</script>` would
    // execute inside the structured-data block.
    const serialised = serializeJsonLd({
      headline: '</script><script>alert(1)</script>',
    });

    expect(serialised).not.toContain('</script>');
    expect(serialised).toContain('\\u003c');
  });

  it('stays valid JSON after escaping', () => {
    const serialised = serializeJsonLd({ headline: '<b>Shirts</b> & Trousers' });
    expect(JSON.parse(serialised).headline).toBe('<b>Shirts</b> & Trousers');
  });
});

describe('sitemap', () => {
  it('lists entries as absolute tenant URLs', () => {
    const xml = buildSitemap(site, [
      { path: '/', priority: 1 },
      { path: '/blog/shirts', lastModified: new Date('2026-09-21T10:00:00.000Z') },
    ]);

    expect(xml).toContain('<loc>http://ade-store.hordemart.com/</loc>');
    expect(xml).toContain('<loc>http://ade-store.hordemart.com/blog/shirts</loc>');
    expect(xml).toContain('<lastmod>2026-09-21</lastmod>');
  });

  it('escapes XML so a slug cannot break the document', () => {
    const xml = buildSitemap(site, [{ path: '/blog/a&b' }]);
    expect(xml).toContain('&amp;');
    expect(xml).not.toContain('/a&b<');
  });

  it('is well-formed with no entries', () => {
    const xml = buildSitemap(site, []);
    expect(xml).toContain('<urlset');
    expect(xml).toContain('</urlset>');
  });
});

describe('robots', () => {
  it('points at the tenant sitemap', () => {
    expect(buildRobots(site)).toContain('Sitemap: http://ade-store.hordemart.com/sitemap.xml');
  });

  it('keeps crawlers out of the API and checkout', () => {
    const robots = buildRobots(site);
    expect(robots).toContain('Disallow: /api/');
    expect(robots).toContain('Disallow: /checkout');
  });

  it('can disallow everything for a site that should not be indexed yet', () => {
    const robots = buildRobots(site, { disallowAll: true });
    expect(robots).toContain('Disallow: /');
    expect(robots).not.toContain('Allow: /');
  });
});

describe('module gating', () => {
  function makeSite(modules: Record<string, boolean>): SiteDocument {
    return new Site({
      slug: 'ade-store',
      name: 'Ade Stores',
      ownerId: new Types.ObjectId(),
      planCode: 'free',
      modules,
    }) as SiteDocument;
  }

  it('reports an enabled module', () => {
    expect(isModuleEnabled(makeSite({ blog: true }), 'blog')).toBe(true);
  });

  it('reports a disabled module', () => {
    expect(isModuleEnabled(makeSite({ blog: false }), 'blog')).toBe(false);
  });

  it('throws NotFound rather than Forbidden for a disabled module', () => {
    // 403 would confirm the site exists with the feature switched off, which no
    // anonymous visitor needs to know.
    expect(() => assertModuleEnabled(makeSite({ blog: false }), 'blog')).toThrow(NotFoundError);
  });

  it('passes for an enabled module', () => {
    expect(() => assertModuleEnabled(makeSite({ blog: true }), 'blog')).not.toThrow();
  });

  it('gates each module independently', () => {
    const site = makeSite({ store: true, blog: false, portfolio: true });
    expect(() => assertModuleEnabled(site, 'store')).not.toThrow();
    expect(() => assertModuleEnabled(site, 'portfolio')).not.toThrow();
    expect(() => assertModuleEnabled(site, 'blog')).toThrow(NotFoundError);
  });
});

/**
 * Store customisation, without a database: theme validation and contrast,
 * the page-layout allow-list against malicious payloads, slug rules, and the
 * draft → published rule. Isolation and persistence are in
 * tests/integration/design.test.ts.
 */

import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { themeSchema, themeToCssVars, contrastProblems, type Theme } from '../../src/lib/design/theme';
import { MAX_PAGE_BYTES, parsePageData, sanitizeBlockRichText, type PageData } from '../../src/lib/design/blocks';
import { PRESET_THEMES, presetPage } from '../../src/lib/design/presets';
import { promoteDraft, validateDraft } from '../../src/lib/design/service';
import { siteImageFolder } from '../../src/lib/products/images';
import { slugSchema } from '../../src/lib/validation/schemas';
import { ValidationError } from '../../src/lib/errors';

const fashion = PRESET_THEMES.fashion;
const siteId = '64b7f0c2a1b2c3d4e5f60718';
const cloud = { cloudName: 'hordemart', apiKey: 'k', apiSecret: 's' };

function page(content: unknown[]): unknown {
  return { root: { props: {} }, content };
}

const hero = (props: Record<string, unknown> = {}) => ({
  type: 'Hero',
  props: { id: 'hero-1', heading: 'New stock', ...props },
});

describe('theme tokens', () => {
  it.each(Object.keys(PRESET_THEMES))('the %s preset is valid and readable', (id) => {
    const theme = PRESET_THEMES[id as keyof typeof PRESET_THEMES];
    expect(() => themeSchema.parse(theme)).not.toThrow();
    expect(contrastProblems(theme.colors)).toEqual([]);
  });

  it('refuses text the customer cannot read', () => {
    const unreadable = { ...fashion, colors: { ...fashion.colors, text: '#dddddd' } };
    const result = themeSchema.safeParse(unreadable);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['colors', 'text']);
  });

  it('refuses white button text on a pale button', () => {
    const pale = { ...fashion, colors: { ...fashion.colors, accent: '#f6e27a', accentText: '#ffffff' } };
    expect(themeSchema.safeParse(pale).success).toBe(false);
  });

  it('refuses anything but a six-digit hex colour, so nothing reaches a stylesheet', () => {
    for (const value of ['red', '#fff', 'url(javascript:alert(1))', '#000000;background:url(x)', 'expression(alert(1))']) {
      const theme = { ...fashion, colors: { ...fashion.colors, accent: value } };
      expect(themeSchema.safeParse(theme).success, value).toBe(false);
    }
  });

  it('refuses a font that is not on the curated list, and unknown keys', () => {
    expect(themeSchema.safeParse({ ...fashion, fontPair: 'comic-sans' }).success).toBe(false);
    expect(themeSchema.safeParse({ ...fashion, customCss: 'body{display:none}' }).success).toBe(false);
  });

  it('turns a theme into CSS variables made only of hex values and fixed strings', () => {
    const vars = themeToCssVars(themeSchema.parse(fashion));
    for (const value of Object.values(vars)) {
      expect(value).toMatch(/^(#[0-9a-f]{6}|color-mix\(in srgb, #[0-9a-f]{6} \d+%, #[0-9a-f]{6}\)|var\(--font-[a-z-]+\), ui-sans-serif, system-ui, sans-serif|\d+px|light)$/);
    }
  });
});

describe('page layout: allow-list and sanitising', () => {
  it.each(['fashion', 'food', 'electronics'] as const)('accepts the %s starter page', (preset) => {
    expect(() => parsePageData(presetPage(preset, 'Ade Textiles'))).not.toThrow();
  });

  it('refuses block types that are not on the allow-list', () => {
    for (const type of ['RawHtml', 'Script', 'Iframe', 'Embed', 'html']) {
      expect(() => parsePageData(page([{ type, props: { id: 'x', html: '<script>alert(1)</script>' } }])), type).toThrow(ValidationError);
    }
  });

  it('refuses props a block does not declare (a smuggled dangerouslySetInnerHTML, style or handler)', () => {
    for (const extra of [
      { dangerouslySetInnerHTML: { __html: '<img src=x onerror=alert(1)>' } },
      { style: { background: 'url(javascript:alert(1))' } },
      { onClick: 'alert(1)' },
    ]) {
      expect(() => parsePageData(page([hero(extra)]))).toThrow(ValidationError);
    }
  });

  it('strips markup from plain-text fields', () => {
    const parsed = parsePageData(page([hero({ heading: '<script>alert(1)</script>Sale' })])) as PageData;
    const heading = (parsed.content[0] as { props: { heading: string } }).props.heading;
    expect(heading).not.toContain('<');
    expect(heading).toContain('Sale');
  });

  it('refuses links that leave the store', () => {
    for (const href of ['javascript:alert(1)', 'https://evil.example', '//evil.example', '/\\evil.example', 'data:text/html,x', ' javascript:alert(1)']) {
      expect(() => parsePageData(page([hero({ ctaHref: href })])), href).toThrow(ValidationError);
    }
    expect(() => parsePageData(page([hero({ ctaHref: '/shop/adire-wrap?colour=blue' })]))).not.toThrow();
  });

  it('sanitises rich text: scripts, handlers and javascript: links go, formatting stays', () => {
    const dirty =
      '<p><strong>Delivery</strong> in <em>2 days</em><script>alert(1)</script></p>' +
      '<img src=x onerror="alert(1)"><iframe src="https://evil.example"></iframe>' +
      '<a href="javascript:alert(1)">click</a><a href="https://wa.me/2348000000000">chat</a>' +
      '<p style="position:fixed" onclick="alert(1)">x</p>';
    const clean = sanitizeBlockRichText(dirty);
    expect(clean).toContain('<strong>Delivery</strong>');
    expect(clean).toContain('href="https://wa.me/2348000000000"');
    for (const bad of ['<script', 'onerror', '<img', '<iframe', 'javascript:', 'style=', 'onclick']) {
      expect(clean, bad).not.toContain(bad);
    }
  });

  it('sanitises FAQ answers on parse, not only on render', () => {
    const parsed = parsePageData(
      page([{ type: 'FAQ', props: { id: 'faq', heading: 'Q', items: [{ question: 'Pay?', answer: '<p>Card</p><script>steal()</script>' }] } }]),
    ) as PageData;
    const answer = (parsed.content[0] as { props: { items: Array<{ answer: string }> } }).props.items[0].answer;
    expect(answer).toBe('<p>Card</p>');
  });

  it('refuses nested drop zones and too many blocks', () => {
    expect(() => parsePageData({ ...(page([]) as object), zones: { 'x:y': [hero()] } })).toThrow(ValidationError);
    expect(() => parsePageData(page(Array.from({ length: 31 }, (_, i) => hero({ id: `h${i}` }))))).toThrow(/at most 30/);
  });

  it('refuses an oversized page before trying to parse it', () => {
    const huge = page([hero({ subheading: 'x'.repeat(MAX_PAGE_BYTES) })]);
    expect(() => parsePageData(huge)).toThrow(/too large/);
  });

  it('refuses a WhatsApp number that is not digits, which would otherwise build a link', () => {
    const wa = (phone: string) => ({ type: 'ContactWhatsApp', props: { id: 'wa', phone } });
    expect(() => parsePageData(page([wa('evil.example/?')]))).toThrow(ValidationError);
    expect(() => parsePageData(page([wa('2348012345678')]))).not.toThrow();
  });
});

describe('design images must be this store’s own uploads', () => {
  const ownId = `${siteImageFolder(siteId, 'design')}/banner`;
  const image = (publicId: string, url: string) => ({ cloudinaryPublicId: publicId, url });

  it('accepts an image in this store’s design folder', () => {
    const draft = { theme: fashion, page: page([hero({ image: image(ownId, `https://res.cloudinary.com/hordemart/image/upload/v1/${ownId}.jpg`) })]) };
    expect(() => validateDraft(draft, siteId, cloud)).not.toThrow();
  });

  it('refuses another store’s image, someone else’s cloud, and a logo from elsewhere', () => {
    const other = `${siteImageFolder('64b7f0c2a1b2c3d4e5f60799', 'design')}/banner`;
    expect(() =>
      validateDraft({ theme: fashion, page: page([hero({ image: image(other, `https://res.cloudinary.com/hordemart/image/upload/${other}.jpg`) })]) }, siteId, cloud),
    ).toThrow();
    expect(() =>
      validateDraft({ theme: fashion, page: page([hero({ image: image(ownId, `https://res.cloudinary.com/attacker/image/upload/${ownId}.jpg`) })]) }, siteId, cloud),
    ).toThrow();
    const logo = image(ownId, 'https://evil.example/logo.png');
    expect(() => validateDraft({ theme: { ...fashion, logo }, page: page([]) }, siteId, cloud)).toThrow();
  });
});

describe('draft versus published', () => {
  it('publishes a copy: later edits to the draft do not leak into what customers see', () => {
    const draft = { theme: structuredClone(fashion) as Theme, page: presetPage('fashion', 'Ade') };
    const published = promoteDraft(draft, null, new Types.ObjectId());
    draft.theme.colors.accent = '#000000';
    (draft.page.content as unknown[]).length = 0;

    expect(published.theme.colors.accent).toBe(fashion.colors.accent);
    expect(published.page.content.length).toBeGreaterThan(0);
  });

  it('only ever moves the version forward', () => {
    const draft = { theme: fashion, page: presetPage('food', 'Ade') };
    expect(promoteDraft(draft, null, null).version).toBe(1);
    expect(promoteDraft(draft, { version: 7 }, null).version).toBe(8);
  });
});

describe('store address rules', () => {
  it.each(['app', 'www', 'admin', 'api'])('refuses the reserved name %s', (slug) => {
    expect(slugSchema.safeParse(slug).success).toBe(false);
  });

  it('accepts lowercase letters, digits and hyphens', () => {
    expect(slugSchema.parse('Ade-Fabrics-2')).toBe('ade-fabrics-2');
  });

  it.each(['ab', 'ade fabrics', 'ade_fabrics', 'ade.fabrics', '-ade', 'a'.repeat(31)])('refuses %s', (slug) => {
    expect(slugSchema.safeParse(slug).success).toBe(false);
  });
});

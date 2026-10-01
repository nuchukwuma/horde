/**
 * Store customisation, without a database: theme validation and contrast,
 * the page-layout allow-list against malicious payloads, slug rules, and the
 * draft → published rule. Isolation and persistence are in
 * tests/integration/design.test.ts.
 */

import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import {
  contrastProblems,
  logoIconUrl,
  normaliseTheme,
  themeAttributes,
  themeSchema,
  themeToCssVars,
  withLook,
  type Theme,
} from '../../src/lib/design/theme';
import { LOOKS, LOOK_IDS } from '../../src/lib/design/looks';
import { FONT_PAIRS } from '../../src/lib/design/fonts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import StoreBrand from '../../src/components/shop/StoreBrand';
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
      expect(value).toMatch(SAFE_CSS_VALUE);
    }
  });
});

/** Values themeToCssVars may emit: hex colours, our own font stacks, lengths. */
const SAFE_CSS_VALUE =
  /^(#[0-9a-f]{6}|var\(--font-[a-z-]+\), (ui-sans-serif, system-ui, sans-serif|ui-monospace, SFMono-Regular, Menlo, monospace)|\d+px)$/;

describe('looks and dark mode', () => {
  it.each(LOOK_IDS)('the %s look has readable light and dark palettes and a real font pair', (id) => {
    const look = LOOKS[id];
    expect(contrastProblems(look.light)).toEqual([]);
    expect(contrastProblems(look.dark)).toEqual([]);
    expect(FONT_PAIRS[look.fontPair]).toBeDefined();
    const theme = withLook(fashion, id);
    expect(() => themeSchema.parse({ ...theme, mode: 'auto' })).not.toThrow();
  });

  it.each(Object.keys(PRESET_THEMES))('the %s preset’s dark palette is readable', (id) => {
    const theme = PRESET_THEMES[id as keyof typeof PRESET_THEMES];
    expect(contrastProblems(theme.darkColors)).toEqual([]);
    expect(() => themeSchema.parse({ ...theme, mode: 'dark' })).not.toThrow();
  });

  it('reads a theme saved before looks existed as Adire, light — how it looked then', () => {
    const legacy = Object.fromEntries(
      Object.entries(fashion).filter(([key]) => !['style', 'mode', 'darkColors'].includes(key)),
    );
    const parsed = themeSchema.parse(legacy);
    expect(parsed.style).toBe('adire');
    expect(parsed.mode).toBe('light');
    expect(parsed.darkColors).toEqual(LOOKS.adire.dark);
    expect(normaliseTheme(legacy)).toMatchObject({ style: 'adire', mode: 'light' });
    expect(themeAttributes(parsed)).toMatchObject({ 'data-look': 'adire', 'data-mode': 'light' });
  });

  it('refuses unreadable dark colours when dark can be shown, and ignores them when it cannot', () => {
    const badDark = { ...fashion.darkColors, text: '#2a2a2a' };
    for (const mode of ['dark', 'auto'] as const) {
      const result = themeSchema.safeParse({ ...fashion, mode, darkColors: badDark });
      expect(result.success, mode).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(['darkColors', 'text']);
      expect(result.error?.issues[0]?.message).toMatch(/^Dark mode: /);
    }
    expect(themeSchema.safeParse({ ...fashion, mode: 'light', darkColors: badDark }).success).toBe(true);
  });

  it('refuses an unknown look or mode, and non-hex dark colours', () => {
    expect(themeSchema.safeParse({ ...fashion, style: 'brutalist' }).success).toBe(false);
    expect(themeSchema.safeParse({ ...fashion, mode: 'sepia' }).success).toBe(false);
    const injected = { ...fashion, mode: 'dark', darkColors: { ...fashion.darkColors, accent: '#000;background:url(x)' } };
    expect(themeSchema.safeParse(injected).success).toBe(false);
  });

  it('emits dark variables only when dark can be shown, all of them safe values', () => {
    const light = themeToCssVars(themeSchema.parse(fashion));
    expect(Object.keys(light).some((key) => key.startsWith('--thd-'))).toBe(false);

    const receipt = themeSchema.parse({ ...withLook(fashion, 'receipt'), mode: 'auto' });
    const vars = themeToCssVars(receipt);
    expect(vars['--thd-bg']).toBe(LOOKS.receipt.dark.background);
    expect(vars['--font-mono']).toContain('--font-plex-mono');
    for (const [key, value] of Object.entries(vars)) {
      expect(value, key).toMatch(SAFE_CSS_VALUE);
    }
  });

  it('a look changes palette and fonts but keeps the seller’s logo and mode', () => {
    const logo = { cloudinaryPublicId: 'hordemart/sites/x/design/logo', url: 'https://res.cloudinary.com/hordemart/image/upload/logo.png' };
    const dressed = withLook({ ...fashion, logo, mode: 'auto' }, 'danfo');
    expect(dressed).toMatchObject({ style: 'danfo', mode: 'auto', logo, fontPair: 'danfo', preset: 'custom' });
    expect(dressed.colors).toEqual(LOOKS.danfo.light);
    expect(dressed.darkColors).toEqual(LOOKS.danfo.dark);
  });
});

describe('store logo', () => {
  const ownId = `${siteImageFolder(siteId, 'design')}/logo`;
  const logo = { cloudinaryPublicId: ownId, url: `https://res.cloudinary.com/hordemart/image/upload/v1/${ownId}.png`, width: 400, height: 120 };
  const logoDark = { ...logo, cloudinaryPublicId: `${ownId}-dark`, url: `https://res.cloudinary.com/hordemart/image/upload/v1/${ownId}-dark.png` };
  const brand = (theme: Partial<Theme> | null, mode?: string) =>
    renderToStaticMarkup(createElement(StoreBrand, { name: 'Ade Textiles', theme, ...(mode ? { mode } : {}) }));

  it('defaults the new logo settings, so designs saved earlier are unchanged', () => {
    const parsed = themeSchema.parse({ ...fashion, logoDark: undefined, logoSize: undefined, showName: undefined });
    expect(parsed).toMatchObject({ logoDark: null, logoSize: 'md', showName: true });
    expect(themeAttributes(parsed)['data-logo-size']).toBe('md');
  });

  it('refuses an unknown size, a non-boolean name switch, and a dark logo from elsewhere', () => {
    expect(themeSchema.safeParse({ ...fashion, logoSize: 'xl' }).success).toBe(false);
    expect(themeSchema.safeParse({ ...fashion, showName: 'no' }).success).toBe(false);
    const foreign = { ...logo, url: 'https://evil.example/logo.png' };
    expect(() => validateDraft({ theme: { ...fashion, logo, logoDark: foreign }, page: page([]) }, siteId, cloud)).toThrow();
    expect(() => validateDraft({ theme: { ...fashion, logo, logoDark }, page: page([]) }, siteId, cloud)).not.toThrow();
  });

  it('shows initials and the name when there is no logo, whatever the name switch says', () => {
    const html = brand({ ...fashion, logo: null, showName: false });
    expect(html).toContain('class="monogram"');
    expect(html).toContain('<span class="store-brand__name">Ade Textiles</span>');
    expect(html).not.toContain('<img');
  });

  it('keeps the store name for screen readers when the logo already spells it', () => {
    const html = brand({ ...fashion, logo, showName: false, logoSize: 'lg' });
    expect(html).toContain('store-brand--logo-lg');
    expect(html).toContain('alt=""');
    expect(html).toContain('<span class="visually-hidden">Ade Textiles</span>');
  });

  it('picks the logo for the mode showing; "match phone" lets the browser download only one', () => {
    const theme = { ...fashion, logo, logoDark };
    expect(brand(theme, 'light')).toContain(logo.url);
    expect(brand(theme, 'light')).not.toContain(logoDark.url);
    expect(brand(theme, 'dark')).toContain(logoDark.url);
    expect(brand(theme, 'dark')).not.toContain(logo.url);
    expect(brand({ ...theme, logoDark: null }, 'dark')).toContain(logo.url);
    const auto = brand(theme, 'auto');
    expect(auto).toContain(`<source srcSet="${logoDark.url}" media="(prefers-color-scheme: dark)"/>`);
    expect(auto).toContain(`src="${logo.url}"`);
  });

  it('builds a small tab icon on our own cloud, and falls back to the upload without one', () => {
    expect(logoIconUrl(logo, 'hordemart')).toBe(`https://res.cloudinary.com/hordemart/image/upload/c_fit,w_96,h_96,f_png/${ownId}`);
    expect(logoIconUrl(logo, null)).toBe(logo.url);
    expect(logoIconUrl(logo, 'evil.example/x')).toBe(logo.url);
    expect(logoIconUrl(null, 'hordemart')).toBeNull();
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

import localFont from 'next/font/local';

/**
 * Every typeface HordeMart can render, self-hosted.
 *
 * The woff2 files are committed in src/assets/fonts (taken from the Fontsource
 * packages) rather than fetched from Google at build time: the CSP allows
 * fonts from 'self' only, and a build that depends on reaching
 * fonts.googleapis.com fails the day that request does. They are not read
 * from node_modules either — a path into node_modules breaks whenever an
 * install is stale or hoisted differently. Latin subset, variable weight, one
 * woff2 each (~20–50 KB).
 *
 * Each family is exposed as a CSS variable on <html>. Declaring a family costs
 * one @font-face rule; the browser downloads a file only when text actually
 * uses it, so a storefront fetches just the pair its seller picked
 * (lib/design/fonts.ts) and nothing else.
 *
 * Nothing here is preloaded. A preload in the root layout reaches every
 * route, stores included, and made every store download HordeMart's own pair
 * (~70 KB) whatever its seller chose. HordeMart's own pages live in the
 * app/(platform) route group, whose layout preloads the pair
 * (components/platform/platformFonts.js); stores sit outside that group.
 *
 * Licences: all SIL Open Font License 1.1 (copies beside each file).
 */


// Platform pair (Adire direction). Preloaded on HordeMart's pages only (see above).
export const unbounded = localFont({
  src: '../assets/fonts/unbounded-latin-wght-normal.woff2',
  variable: '--font-unbounded',
  weight: '200 900',
  display: 'swap',
  preload: false,
  fallback: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
});

export const figtree = localFont({
  src: '../assets/fonts/figtree-latin-wght-normal.woff2',
  variable: '--font-figtree',
  weight: '300 900',
  display: 'swap',
  preload: false,
  fallback: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
});

// Storefront pairs: declared, never preloaded.
export const bricolage = localFont({
  src: '../assets/fonts/bricolage-grotesque-latin-wght-normal.woff2',
  variable: '--font-bricolage',
  weight: '200 800',
  display: 'swap',
  preload: false,
  fallback: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
});

export const fraunces = localFont({
  src: '../assets/fonts/fraunces-latin-wght-normal.woff2',
  variable: '--font-fraunces',
  weight: '100 900',
  display: 'swap',
  preload: false,
  fallback: ['ui-serif', 'Georgia', 'Times New Roman', 'serif'],
});

export const inter = localFont({
  src: '../assets/fonts/inter-latin-wght-normal.woff2',
  variable: '--font-inter',
  weight: '100 900',
  display: 'swap',
  preload: false,
  fallback: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
});

export const spaceGrotesk = localFont({
  src: '../assets/fonts/space-grotesk-latin-wght-normal.woff2',
  variable: '--font-space-grotesk',
  weight: '300 700',
  display: 'swap',
  preload: false,
  fallback: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
});

export const playfair = localFont({
  src: '../assets/fonts/playfair-display-latin-wght-normal.woff2',
  variable: '--font-playfair',
  weight: '400 900',
  display: 'swap',
  preload: false,
  fallback: ['ui-serif', 'Georgia', 'Times New Roman', 'serif'],
});

export const manrope = localFont({
  src: '../assets/fonts/manrope-latin-wght-normal.woff2',
  variable: '--font-manrope',
  weight: '200 800',
  display: 'swap',
  preload: false,
  fallback: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
});

export const sora = localFont({
  src: '../assets/fonts/sora-latin-wght-normal.woff2',
  variable: '--font-sora',
  weight: '100 800',
  display: 'swap',
  preload: false,
  fallback: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
});

// Danfo look: painted-sign headlines, a body face designed for legibility.
export const bigShoulders = localFont({
  src: '../assets/fonts/big-shoulders-display-latin-wght-normal.woff2',
  variable: '--font-big-shoulders',
  weight: '100 900',
  display: 'swap',
  preload: false,
  fallback: ['Impact', 'Arial Narrow', 'ui-sans-serif', 'sans-serif'],
});

export const atkinson = localFont({
  src: [
    { path: '../assets/fonts/atkinson-hyperlegible-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../assets/fonts/atkinson-hyperlegible-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-atkinson',
  display: 'swap',
  preload: false,
  fallback: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
});

// Credit Alert look: a plain grotesk, and a monospace for receipt figures.
export const familjen = localFont({
  src: '../assets/fonts/familjen-grotesk-latin-wght-normal.woff2',
  variable: '--font-familjen',
  weight: '400 700',
  display: 'swap',
  preload: false,
  fallback: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
});

export const plexMono = localFont({
  src: [
    { path: '../assets/fonts/ibm-plex-mono-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../assets/fonts/ibm-plex-mono-latin-500-normal.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--font-plex-mono',
  display: 'swap',
  preload: false,
  fallback: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
});

export const fontVariables = [
  unbounded,
  figtree,
  bricolage,
  fraunces,
  inter,
  spaceGrotesk,
  playfair,
  manrope,
  sora,
  bigShoulders,
  atkinson,
  familjen,
  plexMono,
]
  .map((font) => font.variable)
  .join(' ');

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
 * uses it. So only the platform pair is preloaded — a storefront fetches just
 * the pair its seller picked (lib/design/fonts.ts), and nothing else.
 *
 * Licences: all SIL Open Font License 1.1 (copies beside each file).
 */


// Platform pair (Adire direction): preloaded.
export const unbounded = localFont({
  src: '../assets/fonts/unbounded-latin-wght-normal.woff2',
  variable: '--font-unbounded',
  weight: '200 900',
  display: 'swap',
  fallback: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
});

export const figtree = localFont({
  src: '../assets/fonts/figtree-latin-wght-normal.woff2',
  variable: '--font-figtree',
  weight: '300 900',
  display: 'swap',
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
]
  .map((font) => font.variable)
  .join(' ');

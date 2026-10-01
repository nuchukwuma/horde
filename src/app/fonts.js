import localFont from 'next/font/local';

/**
 * Every typeface HordeMart can render, self-hosted.
 *
 * Self-hosted from Fontsource npm packages rather than fetched from Google at
 * build time: the CSP allows fonts from 'self' only, and a build that depends
 * on reaching fonts.googleapis.com fails the day that request does. Latin
 * subset, variable weight, one woff2 each (~25–45 KB).
 *
 * Each family is exposed as a CSS variable on <html>. Declaring a family costs
 * one @font-face rule; the browser downloads a file only when text actually
 * uses it. So only the platform pair is preloaded — a storefront fetches just
 * the pair its seller picked (lib/design/fonts.ts), and nothing else.
 *
 * Licences: all SIL Open Font License 1.1 (see each package's LICENSE).
 */


// Platform pair (Adire direction): preloaded.
export const unbounded = localFont({
  src: '../../node_modules/@fontsource-variable/unbounded/files/unbounded-latin-wght-normal.woff2',
  variable: '--font-unbounded',
  weight: '200 900',
  display: 'swap',
  fallback: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
});

export const figtree = localFont({
  src: '../../node_modules/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2',
  variable: '--font-figtree',
  weight: '300 900',
  display: 'swap',
  fallback: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
});

// Storefront pairs: declared, never preloaded.
export const bricolage = localFont({
  src: '../../node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2',
  variable: '--font-bricolage',
  weight: '200 800',
  display: 'swap',
  preload: false,
  fallback: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
});

export const fraunces = localFont({
  src: '../../node_modules/@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2',
  variable: '--font-fraunces',
  weight: '100 900',
  display: 'swap',
  preload: false,
  fallback: ['ui-serif', 'Georgia', 'Times New Roman', 'serif'],
});

export const inter = localFont({
  src: '../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  variable: '--font-inter',
  weight: '100 900',
  display: 'swap',
  preload: false,
  fallback: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
});

export const spaceGrotesk = localFont({
  src: '../../node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2',
  variable: '--font-space-grotesk',
  weight: '300 700',
  display: 'swap',
  preload: false,
  fallback: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
});

export const playfair = localFont({
  src: '../../node_modules/@fontsource-variable/playfair-display/files/playfair-display-latin-wght-normal.woff2',
  variable: '--font-playfair',
  weight: '400 900',
  display: 'swap',
  preload: false,
  fallback: ['ui-serif', 'Georgia', 'Times New Roman', 'serif'],
});

export const manrope = localFont({
  src: '../../node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2',
  variable: '--font-manrope',
  weight: '200 800',
  display: 'swap',
  preload: false,
  fallback: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
});

export const sora = localFont({
  src: '../../node_modules/@fontsource-variable/sora/files/sora-latin-wght-normal.woff2',
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

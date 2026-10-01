import localFont from 'next/font/local';

/**
 * Bricolage Grotesque, for headings only.
 *
 * Self-hosted from the npm package rather than fetched from Google at build
 * time: the CSP allows fonts from 'self' only, and a build that depends on
 * reaching fonts.googleapis.com fails the day that request does. next/font
 * copies the file into /_next/static and generates a size-adjusted fallback
 * so the swap does not shift the layout. Latin subset, variable weight: 41 KB.
 *
 * Licence: SIL Open Font License 1.1 (see the package's LICENSE).
 */
export const display = localFont({
  src: '../../node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2',
  variable: '--font-bricolage',
  weight: '200 800',
  display: 'swap',
  fallback: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
});

import { connection } from 'next/server';
import { cookies, headers } from 'next/headers';
import { TENANT_SLUG_HEADER } from '@/lib/tenant/headers';
import { COLOR_SCHEME_COOKIE, parseColorScheme } from '@/lib/ui/colorScheme';
import { fontVariables } from './fonts';
import './styles/tokens.css';
import './styles/base.css';
import './styles/scenes.css';
import './styles/landing.css';
import './styles/storefront.css';
import './styles/dashboard.css';

export const metadata = {
  title: 'HordeMart',
  description: 'Stores, portfolios and blogs for Nigerian sellers.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  // Never disable zoom. Pinch-zoom is an accessibility feature, not a layout bug.
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbf7f0' },
    { media: '(prefers-color-scheme: dark)', color: '#14130f' },
  ],
};

export default async function RootLayout({ children }) {
  // Every page renders per request. The CSP nonce is minted per request in
  // middleware, and a page prerendered at build time would ship framework
  // scripts with no nonce — which the browser refuses, leaving a blank page.
  // See lib/security/csp.ts.
  await connection();

  // HordeMart's own pages honour the light/dark switch. A store never does:
  // its scheme is the seller's choice, set in the store design.
  const onStore = Boolean((await headers()).get(TENANT_SLUG_HEADER));
  const scheme = onStore ? null : parseColorScheme((await cookies()).get(COLOR_SCHEME_COOKIE)?.value);

  return (
    <html lang="en-NG" className={fontVariables} data-theme={scheme ?? undefined}>
      <body>{children}</body>
    </html>
  );
}

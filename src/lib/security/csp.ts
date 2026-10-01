/**
 * Content Security Policy, built per host.
 *
 * THE DECISION THIS FILE ENCODES
 *
 * AdSense cannot run under `script-src 'self'`. It needs Google's script hosts
 * and `'unsafe-inline'`. That is a direct conflict with the rule that seller
 * HTML is defended by sanitisation on write PLUS a CSP that forbids inline
 * script — `sanitizeRichText` is written on the assumption that inline
 * execution stays off, so relaxing it turns any sanitiser bypass into a
 * working XSS.
 *
 * The conflict is resolved by host, not by compromise:
 *
 *   apex / app  — the platform's own pages. No seller-authored HTML is
 *                 rendered here, so ad scripts are allowed.
 *   tenant      — a seller's storefront. Seller-authored HTML renders here, so
 *                 script-src stays 'self' and ads are not served at all.
 *   custom      — a seller's own domain. Same as tenant.
 *
 * This costs inventory: storefronts are where the traffic will be. It is still
 * the right trade. A stored XSS on `<seller>.hordemart.com` runs on an origin
 * that shares a registrable domain with the dashboard, and the money in this
 * system is one session away from that page.
 *
 * Edge-safe: middleware imports this, so no Node built-ins and no database.
 */

export type CspHostKind = 'apex' | 'app' | 'tenant' | 'custom-domain' | 'invalid';

/**
 * Google's ad delivery hosts.
 *
 * Kept explicit rather than wildcarded where possible. `*.g.doubleclick.net`
 * is unavoidable — the ad server shards across subdomains — but the script
 * sources are a fixed short list and should stay one.
 */
const AD_SCRIPT_HOSTS = [
  'https://pagead2.googlesyndication.com',
  'https://partner.googleadservices.com',
  'https://tpc.googlesyndication.com',
  'https://www.googletagservices.com',
  'https://adservice.google.com',
];

const AD_FRAME_HOSTS = [
  'https://googleads.g.doubleclick.net',
  'https://tpc.googlesyndication.com',
  'https://www.google.com',
];

const AD_IMG_HOSTS = [
  'https://pagead2.googlesyndication.com',
  'https://tpc.googlesyndication.com',
  'https://*.g.doubleclick.net',
  'https://www.google.com',
];

const AD_CONNECT_HOSTS = [
  'https://pagead2.googlesyndication.com',
  'https://*.g.doubleclick.net',
  'https://adservice.google.com',
];

export interface CspOptions {
  hostKind: CspHostKind;
  isDev: boolean;
  /** False disables ad allowances even on platform hosts. */
  adsEnabled: boolean;
  /**
   * Per-request nonce for the framework's own inline scripts.
   *
   * WHY THIS EXISTS. The App Router streams its page data as inline
   * `<script>self.__next_f.push(...)</script>` tags. Under a bare
   * `script-src 'self'` the browser refuses every one of them, React never
   * starts, and a production build serves a BLANK PAGE — on every host. The
   * development branch below hid this, because it allows inline script.
   *
   * A nonce fixes it without allowing inline script in general: Next.js reads
   * the nonce from this policy on the request and stamps it onto exactly the
   * scripts it emits. Seller HTML is sanitised on write and cannot know a
   * nonce minted per request, so an injected `<script>` still does not run.
   */
  nonce?: string;
}

/** 128 random bits, base64. Edge-safe: Web Crypto only. */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Platform-owned surfaces: no seller HTML is rendered on these. */
export function isPlatformHost(hostKind: CspHostKind): boolean {
  return hostKind === 'apex' || hostKind === 'app';
}

export function buildCsp(options: CspOptions): string {
  const { hostKind, isDev, adsEnabled, nonce } = options;

  // Ads only where no seller content renders, and only when configured.
  const ads = adsEnabled && isPlatformHost(hostKind);

  const scriptSrc = ["'self'"];

  if (nonce) {
    // 'strict-dynamic' lets a nonced script load the chunks it imports, which
    // is how Next.js and the AdSense loader both work. Browsers that honour it
    // then ignore 'self' and host allowlists, so the effective rule becomes
    // "scripts the server vouched for this request, and what they load".
    scriptSrc.push(`'nonce-${nonce}'`, "'strict-dynamic'");
  }
  const frameSrc = ["'self'"];
  const imgSrc = ["'self'", 'data:', 'https://res.cloudinary.com'];
  const connectSrc = ["'self'", 'https://api.paystack.co'];
  const frameAncestors = ["'none'"];

  if (hostKind === 'app') {
    // Product photos go from the seller's browser straight to Cloudinary on a
    // signed, single-folder upload (lib/products/images.ts). Only the
    // dashboard host uploads; storefronts only ever display.
    connectSrc.push('https://api.cloudinary.com');
  }

  if (isDev) {
    // The dev server injects inline bootstrap scripts and React Refresh
    // evaluates module code as strings. Scoped to development by construction:
    // a production build never takes this branch.
    scriptSrc.push("'unsafe-eval'", "'unsafe-inline'");
    connectSrc.push('ws:');
  }

  if (ads) {
    // 'unsafe-inline' is for browsers too old to understand nonces; any
    // browser that does ignores it once a nonce is present. Ads stay confined
    // to platform hosts regardless, because a tenant host must never carry
    // even the fallback.
    scriptSrc.push("'unsafe-inline'", ...AD_SCRIPT_HOSTS);
    frameSrc.push(...AD_FRAME_HOSTS);
    imgSrc.push(...AD_IMG_HOSTS);
    connectSrc.push(...AD_CONNECT_HOSTS);
  }

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    `frame-ancestors ${frameAncestors.join(' ')}`,
    `frame-src ${frameSrc.join(' ')}`,
    "form-action 'self' https://checkout.paystack.com",
    `script-src ${scriptSrc.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imgSrc.join(' ')}`,
    "font-src 'self'",
    `connect-src ${connectSrc.join(' ')}`,
  ].join('; ');
}

/**
 * The AdSense publisher id, or null.
 *
 * Public by nature — it ships in the page and identifies the account to
 * Google — so NEXT_PUBLIC_ is correct here and this is not a secret under the
 * "secrets come from the environment and are never logged" rule.
 */
export function adsenseClient(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const value = env.NEXT_PUBLIC_ADSENSE_CLIENT?.trim();
  // Shape-checked so a half-filled variable does not emit a broken script tag.
  return value && /^ca-pub-\d{10,20}$/.test(value) ? value : null;
}

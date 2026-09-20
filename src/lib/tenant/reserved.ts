/**
 * Subdomain reservation rules.
 *
 * Edge-safe: this module must stay free of Node built-ins so `middleware.ts`
 * can import it.
 */

/** Infrastructure, product surfaces, and anything we may want to claim later. */
const INFRASTRUCTURE = [
  'www', 'app', 'api', 'admin', 'dashboard', 'platform', 'internal', 'system', 'root',
  'auth', 'login', 'logout', 'signup', 'register', 'account', 'accounts', 'profile',
  'billing', 'pay', 'payment', 'payments', 'checkout', 'invoice', 'invoices',
  'webhook', 'webhooks', 'callback', 'callbacks',
  'mail', 'email', 'smtp', 'imap', 'pop', 'ftp', 'sftp', 'ssh',
  'ns', 'ns1', 'ns2', 'ns3', 'dns', 'mx', 'cdn', 'assets', 'static', 'media', 'img', 'images',
  'docs', 'doc', 'help', 'support', 'status', 'blog', 'news', 'about', 'contact',
  'legal', 'terms', 'privacy', 'security', 'abuse', 'postmaster', 'hostmaster', 'webmaster',
  'staging', 'stage', 'dev', 'test', 'testing', 'demo', 'sandbox', 'preview', 'beta', 'alpha',
  'store', 'shop', 'shops', 'stores', 'site', 'sites', 'my', 'me', 'new', 'edit', 'settings',
  'hordemart', 'official', 'team', 'staff', 'partner', 'partners', 'affiliate',
];

/**
 * Financial and payment brands.
 *
 * A store at gtbank.<root> is a phishing page wearing our TLS certificate. The
 * reputational and regulatory cost of hosting one dwarfs the cost of refusing a
 * few legitimate-but-unlucky names, so this list errs wide.
 */
const FINANCIAL_BRANDS = [
  'paystack', 'flutterwave', 'interswitch', 'remita', 'monnify', 'squad',
  'opay', 'palmpay', 'kuda', 'moniepoint', 'carbon', 'fairmoney', 'piggyvest', 'cowrywise',
  'gtbank', 'gtb', 'zenith', 'access', 'accessbank', 'firstbank', 'uba', 'fidelity',
  'sterling', 'stanbic', 'union', 'unionbank', 'wema', 'alat', 'polaris', 'keystone',
  'ecobank', 'fcmb', 'heritage', 'providus', 'jaiz', 'unity', 'titan', 'globus',
  'cbn', 'nibss', 'ndic', 'bvn', 'nin', 'firs', 'efcc',
  'bank', 'banking', 'wallet', 'escrow', 'transfer', 'payout', 'refund', 'verify',
  'verification', 'secure', 'safety', 'alert', 'notice',
  'visa', 'mastercard', 'verve', 'paypal', 'stripe', 'binance', 'bitcoin', 'crypto',
];

export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  ...INFRASTRUCTURE,
  ...FINANCIAL_BRANDS,
]);

export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 30;

/** Lowercase alphanumeric with internal hyphens. No leading/trailing hyphen. */
const SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

export type SlugRejection =
  | 'too_short'
  | 'too_long'
  | 'invalid_characters'
  | 'punycode_not_allowed'
  | 'consecutive_hyphens'
  | 'reserved';

export interface SlugValidation {
  valid: boolean;
  reason?: SlugRejection;
}

export function normalizeSlug(input: string): string {
  return input.trim().toLowerCase();
}

export function validateSlug(input: string): SlugValidation {
  const slug = normalizeSlug(input);

  if (slug.length < SLUG_MIN_LENGTH) return { valid: false, reason: 'too_short' };
  if (slug.length > SLUG_MAX_LENGTH) return { valid: false, reason: 'too_long' };
  if (!SLUG_PATTERN.test(slug)) return { valid: false, reason: 'invalid_characters' };

  // Punycode would let a visually identical Unicode name resolve to a different
  // string than the one a customer thinks they are visiting.
  if (slug.startsWith('xn--')) return { valid: false, reason: 'punycode_not_allowed' };

  // "my--bank" reads as "my-bank" at a glance in most UI fonts.
  if (slug.includes('--')) return { valid: false, reason: 'consecutive_hyphens' };

  if (isReservedSlug(slug)) return { valid: false, reason: 'reserved' };

  return { valid: true };
}

export function isReservedSlug(input: string): boolean {
  const slug = normalizeSlug(input);
  if (RESERVED_SLUGS.has(slug)) return true;

  // Catch decorated variants: "gtbank-ng", "secure-paystack", "opay2".
  return FINANCIAL_BRANDS.some((brand) => {
    if (slug === brand) return true;
    const boundary = `(^|-)${brand}(-|\\d*$)`;
    return new RegExp(boundary).test(slug);
  });
}

export function describeSlugRejection(reason: SlugRejection): string {
  switch (reason) {
    case 'too_short':
      return `Must be at least ${SLUG_MIN_LENGTH} characters`;
    case 'too_long':
      return `Must be at most ${SLUG_MAX_LENGTH} characters`;
    case 'invalid_characters':
      return 'Use only lowercase letters, numbers, and hyphens (not at the start or end)';
    case 'punycode_not_allowed':
      return 'This name is not available';
    case 'consecutive_hyphens':
      return 'Cannot contain two hyphens in a row';
    case 'reserved':
      return 'This name is reserved';
  }
}

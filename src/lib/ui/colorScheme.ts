/**
 * The optional light/dark switch on HordeMart's own pages (landing, sign
 * in, dashboard, admin). With no choice made, the device's setting rules
 * (tokens.css, prefers-color-scheme).
 *
 * The choice is a plain preference cookie, host-only like every cookie
 * here: no Domain attribute, so it never reaches a seller's store. Stores
 * have their own light/dark setting, chosen by the seller.
 */

export const COLOR_SCHEME_COOKIE = 'hm-color-scheme';
export const COLOR_SCHEMES = ['system', 'light', 'dark'] as const;
export type ColorScheme = (typeof COLOR_SCHEMES)[number];

/** A stored choice, or null for "follow the device" (and for anything unexpected). */
export function parseColorScheme(value: unknown): 'light' | 'dark' | null {
  return value === 'light' || value === 'dark' ? value : null;
}

/** The Set-Cookie value for a choice; "system" clears the cookie. */
export function colorSchemeCookie(scheme: ColorScheme, secure: boolean): string {
  const base = `${COLOR_SCHEME_COOKIE}=${scheme === 'system' ? '' : scheme}; Path=/; SameSite=Lax`;
  const age = scheme === 'system' ? '; Max-Age=0' : '; Max-Age=31536000';
  return `${base}${age}${secure ? '; Secure' : ''}`;
}

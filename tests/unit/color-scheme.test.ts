import { describe, expect, it } from 'vitest';
import { COLOR_SCHEME_COOKIE, colorSchemeCookie, parseColorScheme } from '@/lib/ui/colorScheme';

describe('light/dark switch', () => {
  it('only "light" and "dark" are stored choices; anything else follows the device', () => {
    expect(parseColorScheme('light')).toBe('light');
    expect(parseColorScheme('dark')).toBe('dark');
    for (const value of [undefined, null, '', 'system', 'DARK', 'dark;', '<script>', 1]) {
      expect(parseColorScheme(value)).toBeNull();
    }
  });

  it('the cookie is host-only: never a Domain attribute, so stores never see it', () => {
    for (const scheme of ['light', 'dark', 'system'] as const) {
      for (const secure of [true, false]) {
        const cookie = colorSchemeCookie(scheme, secure);
        expect(cookie.startsWith(`${COLOR_SCHEME_COOKIE}=`)).toBe(true);
        expect(cookie.toLowerCase()).not.toContain('domain');
        expect(cookie).toContain('Path=/');
        expect(cookie).toContain('SameSite=Lax');
        expect(cookie.includes('Secure')).toBe(secure);
      }
    }
  });

  it('a choice lasts a year; "system" clears the cookie', () => {
    expect(colorSchemeCookie('dark', true)).toContain('hm-color-scheme=dark; Path=/; SameSite=Lax; Max-Age=31536000');
    expect(colorSchemeCookie('system', true)).toContain('hm-color-scheme=; Path=/; SameSite=Lax; Max-Age=0');
  });
});

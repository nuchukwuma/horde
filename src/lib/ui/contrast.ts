/**
 * Pick readable text for a seller-chosen accent colour.
 *
 * WCAG relative luminance, then whichever of near-black or white has the
 * higher contrast ratio against it. Used server-side when a seller saves a
 * brand colour, so the storefront never has to guess.
 */

const DARK_INK = '#111111';
const LIGHT_INK = '#ffffff';

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) throw new Error(`Not a hex colour: ${hex}`);
  const int = Number.parseInt(match[1], 16);
  const r = (int >> 16) & 0xff;
  const g = (int >> 8) & 0xff;
  const b = int & 0xff;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function readableInkFor(accent: string): string {
  return contrastRatio(accent, LIGHT_INK) >= contrastRatio(accent, DARK_INK) ? LIGHT_INK : DARK_INK;
}

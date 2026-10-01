/**
 * The curated font pairs a seller can choose from.
 *
 * A closed list rather than "any Google Font": every face here is
 * self-hosted (app/fonts.js), already passes the CSP, and was picked to stay
 * legible on a cheap phone screen. A storefront downloads only the two files
 * its pair uses. The values are CSS variable names declared on <html>.
 */

export interface FontPair {
  label: string;
  /** For the picker: what the pair is good at. */
  note: string;
  display: string;
  body: string;
  serif?: boolean;
}

export const FONT_PAIRS = {
  adire: {
    label: 'Unbounded + Figtree',
    note: 'Wide and confident. HordeMart’s own pair.',
    display: '--font-unbounded',
    body: '--font-figtree',
  },
  boutique: {
    label: 'Fraunces + Figtree',
    note: 'Soft serif headlines for fashion and gifts.',
    display: '--font-fraunces',
    body: '--font-figtree',
    serif: true,
  },
  market: {
    label: 'Bricolage + Inter',
    note: 'Lively, a little hand-made.',
    display: '--font-bricolage',
    body: '--font-inter',
  },
  tech: {
    label: 'Space Grotesk + Inter',
    note: 'Precise, for gadgets and electronics.',
    display: '--font-space-grotesk',
    body: '--font-inter',
  },
  classic: {
    label: 'Playfair + Manrope',
    note: 'Formal, for bridal, beauty and events.',
    display: '--font-playfair',
    body: '--font-manrope',
    serif: true,
  },
  friendly: {
    label: 'Sora + Manrope',
    note: 'Round and warm, for food and kids.',
    display: '--font-sora',
    body: '--font-manrope',
  },
} as const satisfies Record<string, FontPair>;

export type FontPairId = keyof typeof FONT_PAIRS;
export const FONT_PAIR_IDS = Object.keys(FONT_PAIRS) as [FontPairId, ...FontPairId[]];

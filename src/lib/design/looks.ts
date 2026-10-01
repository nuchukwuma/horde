/**
 * Store looks: the three art directions a seller can dress a store in.
 *
 *   adire    Textile-led. Indigo and starch, the shop name dyed into cloth.
 *            HordeMart's own direction, and every existing store's look.
 *   danfo    Lagos's yellow commuter bus: painted-sign capitals, tar-black
 *            and bus-yellow stripes, loud and confident.
 *   receipt  "Credit Alert": the POS receipt and the bank alert SMS — the two
 *            things Nigerian buyers already trust. Thermal paper, dashed
 *            rules, prices printed in monospace.
 *
 * A look is ornament (stripes, cloth, perforations — see storefront.css) plus
 * a starting palette and font pair. Picking a look applies its palette; the
 * seller can still change every colour, and the contrast rules in theme.ts
 * apply to whatever they choose. Each look ships a light AND a dark palette,
 * both of which pass those same rules (tests/unit/design.test.ts).
 *
 * Plain data, no imports at runtime: theme.ts reads the dark defaults from
 * here, so this file must not import theme.ts back.
 */

import type { FontPairId } from './fonts';

export const LOOK_IDS = ['adire', 'danfo', 'receipt'] as const;
export type LookId = (typeof LOOK_IDS)[number];

export interface LookColors {
  background: string;
  surface: string;
  text: string;
  accent: string;
  accentText: string;
}

export interface Look {
  label: string;
  note: string;
  fontPair: FontPairId;
  radius: 'none' | 'soft' | 'round';
  buttonStyle: 'solid' | 'outline' | 'pill';
  light: LookColors;
  dark: LookColors;
}

export const LOOKS: Record<LookId, Look> = {
  adire: {
    label: 'Adire',
    note: 'Indigo cloth, dyed with your shop’s name.',
    fontPair: 'adire',
    radius: 'soft',
    buttonStyle: 'solid',
    light: { background: '#fcfcf8', surface: '#ffffff', text: '#161a33', accent: '#22307a', accentText: '#ffffff' },
    dark: { background: '#0f1229', surface: '#161a36', text: '#eef0fb', accent: '#9aa8f2', accentText: '#10143a' },
  },
  danfo: {
    label: 'Danfo',
    note: 'Bus-yellow stripes and painted-sign capitals.',
    fontPair: 'danfo',
    radius: 'none',
    buttonStyle: 'solid',
    // On a light page, yellow buttons would vanish (1.5:1 against chalk), so
    // buttons are tar with yellow lettering — the bus's own colours — and the
    // yellow lives in the stripes.
    light: { background: '#f7f6f2', surface: '#ffffff', text: '#23211e', accent: '#23211e', accentText: '#f5c518' },
    dark: { background: '#171614', surface: '#23211e', text: '#f7f6f2', accent: '#f5c518', accentText: '#23211e' },
  },
  receipt: {
    label: 'Credit Alert',
    note: 'Thermal paper, dashed rules, prices printed like a receipt.',
    fontPair: 'receipt',
    radius: 'none',
    buttonStyle: 'solid',
    // Alert green darkened from #138a50, which is 4.4:1 with white text.
    light: { background: '#fafaf6', surface: '#ffffff', text: '#26262a', accent: '#0f7a46', accentText: '#ffffff' },
    dark: { background: '#121313', surface: '#1b1c1d', text: '#ecece6', accent: '#3ccf86', accentText: '#0b1f14' },
  },
};

/** Colour modes. "auto" follows the visitor's phone setting. */
export const MODE_IDS = ['light', 'dark', 'auto'] as const;
export type ModeId = (typeof MODE_IDS)[number];

/**
 * Store theme tokens: the brand styling a seller controls.
 *
 * Stored as validated values, never as CSS. The storefront turns them into
 * CSS custom properties (themeToCssVars) on its wrapper element; nothing a
 * seller types is ever interpolated into a stylesheet.
 *
 * Readability is enforced, not suggested. A seller cannot save a theme whose
 * text is unreadable against its background, or whose button text is
 * unreadable on its button — the same check runs in the colour picker (as a
 * live warning) and here on the server (as a refusal), and the server is the
 * one that counts.
 */

import { z } from 'zod';
import { contrastRatio } from '../ui/contrast';
import { FONT_PAIRS, FONT_PAIR_IDS, type FontPairId } from './fonts';

/** WCAG AA for body text. */
export const MIN_TEXT_CONTRAST = 4.5;
/** WCAG AA for UI components and large text (WCAG 1.4.11). */
export const MIN_UI_CONTRAST = 3;

const hex = z
  .string()
  .trim()
  .regex(/^#[0-9a-f]{6}$/i, 'Use a six-digit colour like #22307a')
  .transform((value) => value.toLowerCase());

export const designImageSchema = z
  .object({
    cloudinaryPublicId: z.string().trim().min(1).max(300),
    url: z.string().url().startsWith('https://').max(2_000),
    width: z.number().int().positive().max(20_000).optional(),
    height: z.number().int().positive().max(20_000).optional(),
    alt: z.string().trim().max(200).optional(),
  })
  .strict();

export type DesignImage = z.infer<typeof designImageSchema>;

/** Which pairs must clear which bar. Exported for the picker's live warnings. */
export const CONTRAST_RULES = [
  { fg: 'text', bg: 'background', min: MIN_TEXT_CONTRAST, message: 'Text is hard to read on the background' },
  { fg: 'text', bg: 'surface', min: MIN_TEXT_CONTRAST, message: 'Text is hard to read on cards' },
  { fg: 'accentText', bg: 'accent', min: MIN_TEXT_CONTRAST, message: 'Button text is hard to read on the button colour' },
  { fg: 'accent', bg: 'background', min: MIN_UI_CONTRAST, message: 'Buttons do not stand out from the background' },
] as const;

const colorsSchema = z
  .object({
    background: hex,
    surface: hex,
    text: hex,
    accent: hex,
    accentText: hex,
  })
  .strict();

export type ThemeColors = z.infer<typeof colorsSchema>;

export function contrastProblems(colors: ThemeColors) {
  return CONTRAST_RULES.flatMap((rule) => {
    const ratio = contrastRatio(colors[rule.fg], colors[rule.bg]);
    return ratio >= rule.min
      ? []
      : [{ field: rule.fg, against: rule.bg, ratio: Math.round(ratio * 100) / 100, min: rule.min, message: rule.message }];
  });
}

export const themeSchema = z
  .object({
    preset: z.enum(['fashion', 'food', 'electronics', 'custom']),
    colors: colorsSchema,
    fontPair: z.enum(FONT_PAIR_IDS),
    radius: z.enum(['none', 'soft', 'round']),
    buttonStyle: z.enum(['solid', 'outline', 'pill']),
    logo: designImageSchema.nullable(),
  })
  .strict()
  .superRefine((theme, ctx) => {
    for (const problem of contrastProblems(theme.colors)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['colors', problem.field],
        message: `${problem.message} (contrast ${problem.ratio}:1, needs ${problem.min}:1)`,
      });
    }
  });

export type Theme = z.infer<typeof themeSchema>;

const RADIUS = { none: '2px', soft: '12px', round: '22px' } as const;

/**
 * Theme → CSS custom properties for the storefront wrapper.
 *
 * Only validated values reach here (hex colours, enum keys mapped to fixed
 * strings), so nothing in the output was typed freely by a seller.
 */
export function themeToCssVars(theme: Theme): Record<string, string> {
  const { colors } = theme;
  const pair = FONT_PAIRS[theme.fontPair as FontPairId] ?? FONT_PAIRS.adire;
  const radius = RADIUS[theme.radius];

  return {
    '--surface-page': colors.background,
    '--surface-1': colors.surface,
    '--surface-2': `color-mix(in srgb, ${colors.text} 5%, ${colors.background})`,
    '--surface-inset': `color-mix(in srgb, ${colors.text} 9%, ${colors.background})`,
    '--text-primary': colors.text,
    '--text-secondary': `color-mix(in srgb, ${colors.text} 74%, ${colors.background})`,
    '--text-muted': `color-mix(in srgb, ${colors.text} 58%, ${colors.background})`,
    '--border': `color-mix(in srgb, ${colors.text} 12%, ${colors.background})`,
    '--border-strong': `color-mix(in srgb, ${colors.text} 24%, ${colors.background})`,
    '--line': colors.text,
    '--accent': colors.accent,
    '--accent-ink': colors.accentText,
    '--font-display': `var(${pair.display}), ui-sans-serif, system-ui, sans-serif`,
    '--font-sans': `var(${pair.body}), ui-sans-serif, system-ui, sans-serif`,
    '--radius-sm': theme.radius === 'none' ? '2px' : theme.radius === 'soft' ? '8px' : '14px',
    '--radius': radius,
    '--radius-lg': theme.radius === 'none' ? '2px' : theme.radius === 'soft' ? '18px' : '28px',
    colorScheme: 'light',
  };
}

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
import { LOOKS, LOOK_IDS, MODE_IDS } from './looks';

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
    /** Which art direction dresses the store (lib/design/looks.ts). */
    style: z.enum(LOOK_IDS).default('adire'),
    /** Light, dark, or follow the visitor's phone ("auto"). */
    mode: z.enum(MODE_IDS).default('light'),
    colors: colorsSchema,
    /** Used when mode is dark or auto. Defaults to the look's dark palette. */
    darkColors: colorsSchema.optional(),
    fontPair: z.enum(FONT_PAIR_IDS),
    radius: z.enum(['none', 'soft', 'round']),
    buttonStyle: z.enum(['solid', 'outline', 'pill']),
    logo: designImageSchema.nullable(),
    /** Optional version for dark backgrounds; the main logo is used if unset. */
    logoDark: designImageSchema.nullable().default(null),
    /** Header height of the logo: 30, 40 or 52px (see storefront.css). */
    logoSize: z.enum(['sm', 'md', 'lg']).default('md'),
    /** Off when the logo already spells out the store's name. */
    showName: z.boolean().default(true),
  })
  .strict()
  .transform((theme) => ({ ...theme, darkColors: theme.darkColors ?? { ...LOOKS[theme.style].dark } }))
  .superRefine((theme, ctx) => {
    // Both palettes a visitor can actually see must be readable. The dark
    // set is only checked when it can be shown; a light-only store is never
    // refused over colours nobody will see.
    const sets = theme.mode === 'light' ? (['colors'] as const) : (['colors', 'darkColors'] as const);
    for (const key of sets) {
      for (const problem of contrastProblems(theme[key])) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key, problem.field],
          message: `${key === 'darkColors' ? 'Dark mode: ' : ''}${problem.message} (contrast ${problem.ratio}:1, needs ${problem.min}:1)`,
        });
      }
    }
  });

export type Theme = z.infer<typeof themeSchema>;

/** A theme as a client may send it: look, mode and dark colours optional. */
export type ThemeInput = z.input<typeof themeSchema>;

/**
 * Fill in fields that themes saved before looks and dark mode lack, so older
 * drafts and published designs render exactly as they did: Adire, light.
 * Valid input comes back fully parsed; anything else keeps its stored values
 * with only the missing fields defaulted (it was validated when it was saved).
 */
export function normaliseTheme(raw: unknown): Theme {
  const parsed = themeSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const stored = (raw ?? {}) as Partial<Theme>;
  const style = stored.style && stored.style in LOOKS ? stored.style : 'adire';
  return {
    ...(stored as Theme),
    style,
    mode: stored.mode ?? 'light',
    darkColors: stored.darkColors ?? { ...LOOKS[style].dark },
    logoDark: stored.logoDark ?? null,
    logoSize: stored.logoSize ?? 'md',
    showName: stored.showName ?? true,
  };
}

const RADIUS = { none: '2px', soft: '12px', round: '22px' } as const;

/**
 * Theme → CSS custom properties for the storefront wrapper.
 *
 * Only the seller's raw palette goes inline (--th-* for light, --thd-* for
 * dark); every derived token — card tints, borders, muted text — is computed
 * from those in storefront.css, per mode. That split is what lets "auto"
 * switch with the visitor's phone: an inline declaration would beat any
 * @media rule in the stylesheet, so the inline layer must not set the
 * derived tokens itself.
 *
 * Only validated values reach here (hex colours, enum keys mapped to fixed
 * strings), so nothing in the output was typed freely by a seller.
 */
export function themeToCssVars(theme: Theme): Record<string, string> {
  const { colors } = theme;
  const pair = (FONT_PAIRS[theme.fontPair as FontPairId] ?? FONT_PAIRS.adire) as (typeof FONT_PAIRS)[FontPairId] & { mono?: string };
  const radius = RADIUS[theme.radius];

  const vars: Record<string, string> = {
    '--th-bg': colors.background,
    '--th-surface': colors.surface,
    '--th-text': colors.text,
    '--th-accent': colors.accent,
    '--th-accent-ink': colors.accentText,
    '--font-display': `var(${pair.display}), ui-sans-serif, system-ui, sans-serif`,
    '--font-sans': `var(${pair.body}), ui-sans-serif, system-ui, sans-serif`,
    '--radius-sm': theme.radius === 'none' ? '2px' : theme.radius === 'soft' ? '8px' : '14px',
    '--radius': radius,
    '--radius-lg': theme.radius === 'none' ? '2px' : theme.radius === 'soft' ? '18px' : '28px',
  };
  if (pair.mono) vars['--font-mono'] = `var(${pair.mono}), ui-monospace, SFMono-Regular, Menlo, monospace`;

  if ((theme.mode ?? 'light') !== 'light') {
    const dark = theme.darkColors ?? LOOKS[theme.style ?? 'adire'].dark;
    vars['--thd-bg'] = dark.background;
    vars['--thd-surface'] = dark.surface;
    vars['--thd-text'] = dark.text;
    vars['--thd-accent'] = dark.accent;
    vars['--thd-accent-ink'] = dark.accentText;
  }
  return vars;
}

/** The data-* attributes the storefront CSS keys its looks and modes on. */
export function themeAttributes(theme: Theme): Record<string, string> {
  return {
    'data-look': theme.style ?? 'adire',
    'data-mode': theme.mode ?? 'light',
    'data-buttons': theme.buttonStyle,
    'data-logo-size': theme.logoSize ?? 'md',
  };
}

/** Every contrast problem a visitor could see: light always, dark when shown. */
export function themeContrastProblems(theme: Pick<Theme, 'colors' | 'darkColors' | 'mode'>) {
  const light = contrastProblems(theme.colors).map((problem) => ({ ...problem, set: 'colors' as const }));
  if ((theme.mode ?? 'light') === 'light' || !theme.darkColors) return light;
  return [...light, ...contrastProblems(theme.darkColors).map((problem) => ({ ...problem, set: 'darkColors' as const }))];
}

/**
 * Dress a theme in a look: its palettes, font pair, corners and buttons.
 * Keeps what is the seller's own regardless of look — logos and light/dark mode.
 */
export function withLook(theme: Theme, look: keyof typeof LOOKS): Theme {
  const chosen = LOOKS[look];
  return {
    ...theme,
    preset: 'custom',
    style: look,
    colors: { ...chosen.light },
    darkColors: { ...chosen.dark },
    fontPair: chosen.fontPair,
    radius: chosen.radius,
    buttonStyle: chosen.buttonStyle,
  };
}

/**
 * A small square-ish version of the logo for the browser tab, built with a
 * Cloudinary delivery transformation (fit inside 96×96, as PNG) instead of
 * sending the full upload. The public id was checked to be in this store's
 * own folder when the design was saved; without a cloud name the original
 * URL is used as-is.
 */
export function logoIconUrl(logo: DesignImage | null | undefined, cloudName: string | null | undefined): string | null {
  if (!logo) return null;
  if (!cloudName || !/^[a-z0-9_-]{1,64}$/i.test(cloudName)) return logo.url;
  const publicId = logo.cloudinaryPublicId.split('/').map(encodeURIComponent).join('/');
  return `https://res.cloudinary.com/${cloudName}/image/upload/c_fit,w_96,h_96,f_png/${publicId}`;
}

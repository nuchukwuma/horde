'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { FONT_PAIRS } from '@/lib/design/fonts';
import { contrastProblems, withLook } from '@/lib/design/theme';
import { LOOKS } from '@/lib/design/looks';
import { PRESET_THEMES } from '@/lib/design/presets';
import ImageField from './ImageField';
import SocialsSection from './SocialsSection';

/**
 * Brand settings: logo, social media, look, light/dark mode, preset,
 * colours, fonts, corners, buttons.
 *
 * Contrast is checked as the seller picks. A colour that makes text
 * unreadable is flagged immediately and the editor will not save it — and
 * the server refuses it independently (lib/design/theme.ts), so the picker
 * is a courtesy, not the control.
 */

const COLOR_FIELDS = [
  ['background', 'Page background'],
  ['surface', 'Cards'],
  ['text', 'Text'],
  ['accent', 'Buttons and links'],
  ['accentText', 'Button text'],
];

const PRESET_LABELS = { fashion: 'Fashion', food: 'Food', electronics: 'Electronics' };

const MODES = [
  ['light', 'Light'],
  ['dark', 'Dark'],
  ['auto', 'Match phone'],
];

/**
 * What a seller types into a colour box, as a #rrggbb colour or null.
 * Accepts "#22307a", "22307A" and the short "#fff"; anything else is null.
 */
export function normaliseHex(raw) {
  const value = String(raw ?? '').trim().replace(/^#?/, '#').toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(value)) return value;
  if (/^#[0-9a-f]{3}$/.test(value)) return `#${[...value.slice(1)].map((c) => c + c).join('')}`;
  return null;
}

/** One palette's pickers and its readability verdict. */
function ColorSet({ title, colors, onColor, idPrefix }) {
  const problems = contrastProblems(colors);
  const flagged = new Set(problems.flatMap((problem) => [problem.field, problem.against]));
  const [typoField, setTypoField] = useState(null);

  function applyTyped(key, input) {
    const hex = normaliseHex(input.value);
    if (!hex) {
      // Put back the colour in use and say why, rather than silently
      // keeping text that will never be applied.
      input.value = colors[key];
      setTypoField(key);
      return;
    }
    setTypoField(null);
    input.value = hex;
    onColor(key, hex);
  }

  return (
    <>
      {title ? <h4 className="ed-subtitle">{title}</h4> : null}
      {COLOR_FIELDS.map(([key, label]) => (
        <div key={key} className={`ed-color${flagged.has(key) ? ' is-flagged' : ''}`}>
          <input
            type="color"
            aria-label={`${idPrefix}${label}`}
            value={colors[key]}
            onChange={(event) => onColor(key, event.target.value)}
          />
          <span className="ed-color__label">{label}</span>
          <input
            className="input ed-color__hex"
            aria-label={`${idPrefix}${label}, hex value`}
            aria-invalid={typoField === key || undefined}
            defaultValue={colors[key]}
            key={colors[key]}
            maxLength={7}
            spellCheck={false}
            onBlur={(event) => applyTyped(key, event.target)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                applyTyped(key, event.currentTarget);
              }
            }}
          />
        </div>
      ))}
      {typoField ? (
        <p className="ed-error" role="alert">
          That isn’t a colour code. Use six characters like #22307a, or pick from the swatch.
        </p>
      ) : null}
      {problems.length > 0 ? (
        <ul className="ed-warnings" role="alert">
          {problems.map((problem) => (
            <li key={`${problem.field}-${problem.against}`}>
              {problem.message}: contrast {problem.ratio}:1, needs at least {problem.min}:1.
            </li>
          ))}
        </ul>
      ) : (
        <p className="ed-ok">✓ Every colour pair is readable.</p>
      )}
    </>
  );
}

export default function ThemePanel({
  theme,
  onChange,
  siteId,
  onClose,
  previewDark = false,
  onPreviewDark,
  socials,
  onSocialsSaved,
}) {
  const look = theme.style ?? 'adire';
  const mode = theme.mode ?? 'light';
  const darkColors = theme.darkColors ?? LOOKS[look].dark;
  const panelRef = useRef(null);
  const socialsDirty = useRef(false);

  // Open below the editor's header, whose height changes with the window
  // width (its buttons wrap), so Save and Publish stay reachable while the
  // panel is open. The header is found from our own buttons inside it.
  useLayoutEffect(() => {
    const header = document.querySelector('.ed-actions')?.closest('header');
    const panel = panelRef.current;
    if (!header || !panel) return undefined;
    const place = () => {
      panel.style.top = `${Math.round(header.getBoundingClientRect().bottom) + 8}px`;
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(header);
    window.addEventListener('resize', place);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
    };
  }, []);

  function close() {
    if (socialsDirty.current && !window.confirm('Your social media changes are not saved. Close without saving them?')) return;
    onClose();
  }

  function set(patch) {
    onChange({ ...theme, ...patch, preset: patch.preset ?? 'custom' });
  }

  function setColor(key, value) {
    if (!/^#[0-9a-f]{6}$/i.test(value)) return;
    set({ colors: { ...theme.colors, [key]: value.toLowerCase() } });
  }

  function setDarkColor(key, value) {
    if (!/^#[0-9a-f]{6}$/i.test(value)) return;
    set({ darkColors: { ...darkColors, [key]: value.toLowerCase() } });
  }

  return (
    <aside className="ed-panel" aria-label="Brand settings" ref={panelRef}>
      <div className="ed-panel__head">
        <h2 className="ed-panel__title">Brand</h2>
        <button type="button" className="btn btn--sm btn--ghost" onClick={close}>
          Close
        </button>
      </div>

      <section className="ed-group">
        <h3 className="ed-group__title">Logo</h3>
        <ImageField
          value={theme.logo}
          // Removing the logo removes its dark-mode version too: that field is
          // hidden without a main logo, so it would otherwise linger unseen.
          onChange={(logo) => onChange({ ...theme, logo, ...(logo ? {} : { logoDark: null }) })}
          siteId={siteId}
          label={null}
          noun="logo"
          withAlt={false}
          emptyText="No logo yet: your initials are shown in a badge instead."
          hint="A PNG with a transparent background looks best. Square and wide logos both fit."
        />
        {theme.logo ? (
          <>
            <h4 className="ed-subtitle">Size in the header</h4>
            <div className="ed-segment">
              {[
                ['sm', 'Small'],
                ['md', 'Medium'],
                ['lg', 'Large'],
              ].map(([value, label]) => (
                <label key={value} className={(theme.logoSize ?? 'md') === value ? 'is-on' : ''}>
                  <input
                    type="radio"
                    name="logoSize"
                    value={value}
                    checked={(theme.logoSize ?? 'md') === value}
                    onChange={() => onChange({ ...theme, logoSize: value })}
                  />
                  {label}
                </label>
              ))}
            </div>
            <label className="ed-check">
              <input
                type="checkbox"
                checked={theme.showName !== false}
                onChange={(event) => onChange({ ...theme, showName: event.target.checked })}
              />
              Show the store name next to the logo
            </label>
            <p className="ed-hint">Turn this off if your logo already spells out your name.</p>
            {mode !== 'light' ? (
              <ImageField
                value={theme.logoDark ?? null}
                onChange={(logoDark) => onChange({ ...theme, logoDark })}
                siteId={siteId}
                label="Logo for dark mode (optional)"
                noun="logo"
                withAlt={false}
                onDark
                emptyText="Not set: your main logo is used on dark backgrounds too. Add a light-coloured version if it is hard to see."
              />
            ) : null}
          </>
        ) : null}
        <p className="ed-hint">You can see it at the top of the preview. Publish to put it on your store.</p>
      </section>

      <SocialsSection
        siteId={siteId}
        socials={socials}
        onSaved={onSocialsSaved}
        onDirtyChange={(dirty) => {
          socialsDirty.current = dirty;
        }}
      />

      <section className="ed-group">
        <h3 className="ed-group__title">Look</h3>
        <div className="ed-looks">
          {Object.entries(LOOKS).map(([id, option]) => (
            <button
              key={id}
              type="button"
              className={`ed-look ed-look--${id}${look === id ? ' is-on' : ''}`}
              aria-pressed={look === id}
              onClick={() => onChange(withLook({ ...theme, darkColors }, id))}
            >
              <span className="ed-look__art" aria-hidden="true" style={{ '--a': option.light.accent, '--b': option.light.background, '--c': option.light.text }} />
              <span className="ed-look__name" style={{ fontFamily: `var(${FONT_PAIRS[option.fontPair].display})` }}>
                {option.label}
              </span>
              <span className="ed-look__note">{option.note}</span>
            </button>
          ))}
        </div>
        <p className="ed-hint">Choosing a look sets its colours and fonts. You can change any of them below.</p>
      </section>

      <section className="ed-group">
        <h3 className="ed-group__title">Light or dark</h3>
        <div className="ed-segment">
          {MODES.map(([value, label]) => (
            <label key={value} className={mode === value ? 'is-on' : ''}>
              <input
                type="radio"
                name="mode"
                value={value}
                checked={mode === value}
                onChange={() => onChange({ ...theme, darkColors, mode: value })}
              />
              {label}
            </label>
          ))}
        </div>
        {mode === 'auto' ? (
          <>
            <p className="ed-hint">Visitors see light or dark depending on their phone’s setting.</p>
            <div className="ed-segment ed-segment--small" aria-label="Preview">
              {[
                [false, 'Preview light'],
                [true, 'Preview dark'],
              ].map(([value, label]) => (
                <label key={label} className={previewDark === value ? 'is-on' : ''}>
                  <input type="radio" name="previewDark" checked={previewDark === value} onChange={() => onPreviewDark?.(value)} />
                  {label}
                </label>
              ))}
            </div>
          </>
        ) : null}
      </section>

      <section className="ed-group">
        <h3 className="ed-group__title">Start from a preset</h3>
        <div className="ed-presets">
          {Object.entries(PRESET_THEMES).map(([id, preset]) => (
            <button
              key={id}
              type="button"
              className={`ed-preset${theme.preset === id ? ' is-on' : ''}`}
              onClick={() =>
                onChange({
                  ...preset,
                  style: look,
                  mode,
                  // The seller's logo and its settings are theirs, not the preset's.
                  logo: theme.logo,
                  logoDark: theme.logoDark ?? null,
                  logoSize: theme.logoSize ?? 'md',
                  showName: theme.showName ?? true,
                })
              }
            >
              <span className="ed-preset__swatches" aria-hidden="true">
                <i style={{ background: preset.colors.background }} />
                <i style={{ background: preset.colors.accent }} />
                <i style={{ background: preset.colors.text }} />
              </span>
              {PRESET_LABELS[id]}
            </button>
          ))}
        </div>
      </section>

      <section className="ed-group">
        <h3 className="ed-group__title">Colours</h3>
        {mode === 'dark' ? null : (
          <ColorSet title={mode === 'auto' ? 'Light' : null} colors={theme.colors} onColor={setColor} idPrefix="" />
        )}
        {mode === 'light' ? null : (
          <ColorSet title={mode === 'auto' ? 'Dark' : null} colors={darkColors} onColor={setDarkColor} idPrefix="Dark: " />
        )}
      </section>

      <section className="ed-group">
        <h3 className="ed-group__title">Fonts</h3>
        <div className="ed-fonts">
          {Object.entries(FONT_PAIRS).map(([id, pair]) => (
            <label key={id} className={`ed-font${theme.fontPair === id ? ' is-on' : ''}`}>
              <input type="radio" name="fontPair" value={id} checked={theme.fontPair === id} onChange={() => set({ fontPair: id })} />
              <span className="ed-font__sample" style={{ fontFamily: `var(${pair.display})` }}>
                Aa Ankara
              </span>
              <span className="ed-font__name">{pair.label}</span>
              <span className="ed-font__note" style={{ fontFamily: `var(${pair.body})` }}>
                {pair.note}
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="ed-group">
        <h3 className="ed-group__title">Corners</h3>
        <div className="ed-segment">
          {[
            ['none', 'Sharp'],
            ['soft', 'Soft'],
            ['round', 'Round'],
          ].map(([value, label]) => (
            <label key={value} className={theme.radius === value ? 'is-on' : ''}>
              <input type="radio" name="radius" value={value} checked={theme.radius === value} onChange={() => set({ radius: value })} />
              {label}
            </label>
          ))}
        </div>

        <h3 className="ed-group__title" style={{ marginTop: 16 }}>
          Buttons
        </h3>
        <div className="ed-segment">
          {[
            ['solid', 'Solid'],
            ['outline', 'Outline'],
            ['pill', 'Pill'],
          ].map(([value, label]) => (
            <label key={value} className={theme.buttonStyle === value ? 'is-on' : ''}>
              <input
                type="radio"
                name="buttonStyle"
                value={value}
                checked={theme.buttonStyle === value}
                onChange={() => set({ buttonStyle: value })}
              />
              {label}
            </label>
          ))}
        </div>
      </section>

    </aside>
  );
}

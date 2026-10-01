'use client';

import { FONT_PAIRS } from '@/lib/design/fonts';
import { contrastProblems } from '@/lib/design/theme';
import { PRESET_THEMES } from '@/lib/design/presets';
import ImageField from './ImageField';

/**
 * Brand settings: preset, colours, fonts, corners, buttons, logo.
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

export default function ThemePanel({ theme, onChange, siteId, onClose }) {
  const problems = contrastProblems(theme.colors);
  const flagged = new Set(problems.flatMap((problem) => [problem.field, problem.against]));

  function set(patch) {
    onChange({ ...theme, ...patch, preset: patch.preset ?? 'custom' });
  }

  function setColor(key, value) {
    if (!/^#[0-9a-f]{6}$/i.test(value)) return;
    set({ colors: { ...theme.colors, [key]: value.toLowerCase() } });
  }

  return (
    <aside className="ed-panel" aria-label="Brand settings">
      <div className="ed-panel__head">
        <h2 className="ed-panel__title">Brand</h2>
        <button type="button" className="btn btn--sm btn--ghost" onClick={onClose}>
          Close
        </button>
      </div>

      <section className="ed-group">
        <h3 className="ed-group__title">Start from a preset</h3>
        <div className="ed-presets">
          {Object.entries(PRESET_THEMES).map(([id, preset]) => (
            <button
              key={id}
              type="button"
              className={`ed-preset${theme.preset === id ? ' is-on' : ''}`}
              onClick={() => onChange({ ...preset, logo: theme.logo })}
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
        {COLOR_FIELDS.map(([key, label]) => (
          <div key={key} className={`ed-color${flagged.has(key) ? ' is-flagged' : ''}`}>
            <input
              type="color"
              aria-label={label}
              value={theme.colors[key]}
              onChange={(event) => setColor(key, event.target.value)}
            />
            <span className="ed-color__label">{label}</span>
            <input
              className="input ed-color__hex"
              aria-label={`${label}, hex value`}
              defaultValue={theme.colors[key]}
              key={theme.colors[key]}
              maxLength={7}
              onBlur={(event) => setColor(key, event.target.value.trim())}
            />
          </div>
        ))}
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

      <section className="ed-group">
        <ImageField value={theme.logo} onChange={(logo) => onChange({ ...theme, logo })} siteId={siteId} label="Logo" />
      </section>
    </aside>
  );
}

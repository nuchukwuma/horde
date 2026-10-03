'use client';

import { useEffect, useRef, useState } from 'react';
import { COLOR_SCHEMES, colorSchemeCookie } from '@/lib/ui/colorScheme';

/**
 * System / Light / Dark. Applies at once (tokens.css reads data-theme on
 * <html>) and is remembered in a cookie, which the root layout reads so
 * the next page paints in the right scheme with no flash.
 *
 * On a narrow phone only the current choice shows (styles in base.css),
 * and tapping it steps to the next one: the header has no room for three.
 */

const COMPACT = '(max-width: 560px)';

const LABELS = { system: 'Match this device', light: 'Light', dark: 'Dark' };

function Icon({ scheme }) {
  const common = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  if (scheme === 'light') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  }
  if (scheme === 'dark') {
    return (
      <svg {...common}>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}

export default function ColorSchemeSwitch() {
  // The server already put the stored choice on <html>; read it back once
  // mounted rather than guessing during render (which would not hydrate).
  const [scheme, setScheme] = useState('system');
  const group = useRef(null);
  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    setScheme(current === 'light' || current === 'dark' ? current : 'system');
  }, []);

  function press(option) {
    const compact = window.matchMedia?.(COMPACT).matches;
    if (compact && option === scheme) {
      const next = COLOR_SCHEMES[(COLOR_SCHEMES.indexOf(scheme) + 1) % COLOR_SCHEMES.length];
      choose(next);
      // The pressed button is the only one shown: keep focus on the switch.
      requestAnimationFrame(() => group.current?.querySelector(`[data-scheme="${next}"]`)?.focus());
      return;
    }
    choose(option);
  }

  function choose(next) {
    setScheme(next);
    const root = document.documentElement;
    if (next === 'system') delete root.dataset.theme;
    else root.dataset.theme = next;
    document.cookie = colorSchemeCookie(next, window.location.protocol === 'https:');
  }

  return (
    <div ref={group} className="scheme-switch" role="group" aria-label="Colour scheme">
      {COLOR_SCHEMES.map((option) => (
        <button
          key={option}
          type="button"
          className="scheme-switch__option"
          data-scheme={option}
          aria-pressed={scheme === option}
          aria-label={LABELS[option]}
          title={LABELS[option]}
          onClick={() => press(option)}
        >
          <Icon scheme={option} />
        </button>
      ))}
    </div>
  );
}

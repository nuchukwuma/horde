/**
 * Three small looping vignettes for "stock up → share → get paid".
 *
 * Each is a few SVG shapes on a CSS loop (landing.css). They illustrate the
 * step beside them and carry no information of their own, so they are
 * aria-hidden; under reduced motion they rest on their final frame.
 */

export function StockLoop() {
  return (
    <svg className="loop loop--stock" viewBox="0 0 220 160" aria-hidden="true">
      <rect x="60" y="10" width="100" height="146" rx="16" fill="var(--surface-1)" stroke="var(--line)" strokeWidth="3" />
      <rect x="72" y="28" width="76" height="8" rx="4" fill="var(--surface-inset)" />
      <g className="loop__card loop__card--1">
        <rect x="72" y="44" width="36" height="44" rx="6" fill="var(--palm)" stroke="var(--line)" strokeWidth="2.5" />
      </g>
      <g className="loop__card loop__card--2">
        <rect x="112" y="44" width="36" height="44" rx="6" fill="var(--indigo)" stroke="var(--line)" strokeWidth="2.5" />
      </g>
      <g className="loop__card loop__card--3">
        <rect x="72" y="94" width="36" height="44" rx="6" fill="var(--sun)" stroke="var(--line)" strokeWidth="2.5" />
      </g>
      <g className="loop__plus">
        <circle cx="130" cy="116" r="15" fill="var(--accent)" stroke="var(--line)" strokeWidth="2.5" />
        <path d="M130 108 V124 M122 116 H138" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" />
      </g>
    </svg>
  );
}

export function ShareLoop() {
  return (
    <svg className="loop loop--share" viewBox="0 0 220 160" aria-hidden="true">
      <rect x="60" y="10" width="100" height="146" rx="16" fill="var(--surface-1)" stroke="var(--line)" strokeWidth="3" />
      <rect x="60" y="10" width="100" height="22" rx="16" fill="#1f7a5a" />
      <rect x="60" y="22" width="100" height="10" fill="#1f7a5a" />
      <g className="loop__bubble loop__bubble--1">
        <rect x="70" y="42" width="60" height="18" rx="9" fill="var(--surface-inset)" />
      </g>
      <g className="loop__bubble loop__bubble--2">
        <rect x="84" y="66" width="68" height="46" rx="10" fill="#dcf3e4" stroke="var(--line)" strokeWidth="2" />
        <rect x="90" y="72" width="56" height="20" rx="4" fill="var(--sun)" />
        <rect x="90" y="96" width="40" height="5" rx="2.5" fill="var(--accent)" />
        <rect x="90" y="104" width="28" height="4" rx="2" fill="var(--text-muted)" />
      </g>
      <g className="loop__hearts">
        <path className="loop__heart loop__heart--1" d="M178 98 c-6 -8 -18 -2 -10 8 l10 10 l10 -10 c8 -10 -4 -16 -10 -8 Z" fill="var(--clay)" />
        <path className="loop__heart loop__heart--2" d="M188 70 c-4 -6 -12 -1 -7 5 l7 7 l7 -7 c5 -6 -3 -11 -7 -5 Z" fill="var(--palm)" />
        <path className="loop__heart loop__heart--3" d="M40 84 c-4 -6 -12 -1 -7 5 l7 7 l7 -7 c5 -6 -3 -11 -7 -5 Z" fill="var(--sun)" />
      </g>
    </svg>
  );
}

export function PaidLoop() {
  return (
    <svg className="loop loop--paid" viewBox="0 0 220 160" aria-hidden="true">
      {/* Bank */}
      <g>
        <path d="M140 64 L180 44 L220 64 Z" fill="var(--accent)" stroke="var(--line)" strokeWidth="3" strokeLinejoin="round" transform="translate(-14 0)" />
        <rect x="132" y="64" width="68" height="8" fill="var(--surface-1)" stroke="var(--line)" strokeWidth="2.5" />
        {[138, 156, 174, 190].map((x) => (
          <rect key={x} x={x} y="74" width="6" height="40" fill="var(--surface-1)" stroke="var(--line)" strokeWidth="2" />
        ))}
        <rect x="128" y="114" width="76" height="10" fill="var(--surface-1)" stroke="var(--line)" strokeWidth="2.5" />
      </g>
      {/* Notes flying in */}
      {[1, 2, 3].map((n) => (
        <g key={n} className={`loop__note loop__note--${n}`}>
          <rect x="10" y="80" width="46" height="26" rx="4" fill="#9fd39b" stroke="var(--line)" strokeWidth="2.5" />
          <circle cx="33" cy="93" r="7" fill="none" stroke="var(--line)" strokeWidth="2" />
          <text x="33" y="97" textAnchor="middle" fontSize="10" fontWeight="800" fill="var(--line)">
            ₦
          </text>
        </g>
      ))}
      <g className="loop__tick">
        <circle cx="198" cy="40" r="14" fill="var(--leaf)" stroke="var(--line)" strokeWidth="2.5" />
        <path d="M191 40 L196 45 L205 35" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/**
 * Generated product art, for products that have no photo yet.
 *
 * A grey "No image" box makes a new store look abandoned, and most sellers
 * start without photos — they are trading off WhatsApp and will shoot pictures
 * later. So every product gets a poster instead: a market-print background
 * (adire circles, stripes, waves, dots, kente blocks) and an object drawn from
 * what the title says it is — fabric, a dress, shoes, a bag, a bottle, food,
 * a cake, a phone, a book, jewellery — or a wrapped gift when nothing matches.
 *
 * Deterministic: the same title always draws the same picture, on the server
 * and in the browser, so there is no hydration mismatch and a product keeps
 * its look between visits. Pure SVG, so it is CSP-safe, scales to any size
 * and weighs nothing.
 */

import { circlePath, rectPath } from '@/lib/ui/svgPath';

const PALETTES = [
  { bg: '#f6d38a', motif: '#e8772e', fill: '#2b3a8c', accent: '#fffaf2' },
  { bg: '#cfe6d8', motif: '#0f6b4a', fill: '#e8772e', accent: '#fffaf2' },
  { bg: '#dde2f7', motif: '#2b3a8c', fill: '#f4b93e', accent: '#d9677a' },
  { bg: '#f7d4da', motif: '#d9677a', fill: '#0f6b4a', accent: '#f4b93e' },
  { bg: '#fde3cf', motif: '#b0763f', fill: '#d9677a', accent: '#2b3a8c' },
  { bg: '#e8f0d0', motif: '#4caf7a', fill: '#2b3a8c', accent: '#f4b93e' },
];

const INK = '#1b1a17';

/** FNV-1a: small, fast, stable across runtimes. */
export function hashString(value) {
  let hash = 0x811c9dc5;
  const text = String(value ?? '');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

const KINDS = [
  ['fabric', /adire|ankara|aso|fabric|cloth|kente|lace|wrapper|textile|batik|material/i],
  ['dress', /dress|gown|kaftan|agbada|boubou|skirt|top|shirt|blouse|abaya|jumpsuit/i],
  ['shoe', /shoe|sneaker|sandal|slipper|heel|boot|loafer|trainer/i],
  ['bag', /bag|purse|clutch|tote|backpack|wallet/i],
  ['bottle', /perfume|oil|cream|lotion|soap|shea|serum|bottle|drink|juice|zobo|fragrance/i],
  ['bowl', /rice|jollof|pepper|spice|soup|food|beans|garri|yam|chin|chips|snack|suya/i],
  ['cake', /cake|bread|cookie|pastry|pie|cupcake|doughnut|puff/i],
  ['phone', /phone|iphone|android|gadget|charger|earbud|headphone|laptop|tablet/i],
  ['book', /book|journal|notebook|planner|print|poster|magazine/i],
  ['jewel', /bead|necklace|ring|earring|bracelet|jewel|gold|anklet|chain/i],
];

export function productKind(title) {
  for (const [kind, pattern] of KINDS) {
    if (pattern.test(title ?? '')) return kind;
  }
  return 'gift';
}

/**
 * Background print, drawn as plain shapes rather than an SVG <pattern>.
 *
 * Patterns need ids, and ids collide when the same product appears twice on a
 * page (a listing and the basket). Worse, Chrome will not paint a pattern
 * whose definition sits inside a display:none copy, so a hidden duplicate
 * could blank the visible one. Shapes have no ids, so neither can happen.
 *
 * Each print is one or two <path>s holding every repeat (lib/ui/svgPath):
 * the same picture as hundreds of separate circles and rects, at a fraction
 * of the page weight and with almost nothing for the browser to hydrate.
 */
function Motif({ kind, color }) {
  const d = [];
  switch (kind) {
    case 0: {
      // adire: concentric circles
      const dots = [];
      for (let y = 40; y < 520; y += 80) {
        for (let x = 40; x < 420; x += 80) {
          d.push(circlePath(x, y, 26), circlePath(x, y, 12));
          dots.push(circlePath(x, y, 3));
        }
      }
      return (
        <g opacity="0.32">
          <path d={d.join('')} fill="none" stroke={color} strokeWidth="5" />
          <path d={dots.join('')} fill={color} />
        </g>
      );
    }
    case 1: // stripes
      for (let i = -12; i < 22; i += 1) d.push(rectPath(i * 44, -200, 18, 900));
      return <path d={d.join('')} fill={color} opacity="0.24" transform="rotate(-28 200 250)" />;
    case 2: // waves
      for (let y = 20; y < 520; y += 40) {
        d.push(`M-20 ${y} Q5 ${y - 20} 30 ${y} T80 ${y} T130 ${y} T180 ${y} T230 ${y} T280 ${y} T330 ${y} T380 ${y} T430 ${y}`);
      }
      return <path d={d.join('')} fill="none" stroke={color} strokeWidth="6" opacity="0.3" />;
    case 3: // dots
      for (let y = 9; y < 520; y += 36) {
        for (let x = 9; x < 420; x += 36) d.push(circlePath(x, y, 5), circlePath(x + 18, y + 18, 5));
      }
      return <path d={d.join('')} fill={color} opacity="0.3" />;
    default: // kente-ish blocks
      for (let y = 0; y < 520; y += 96) {
        for (let x = 0; x < 420; x += 96) {
          d.push(rectPath(x, y, 48, 16), rectPath(x + 48, y + 48, 48, 16), rectPath(x + 16, y + 56, 16, 40), rectPath(x + 64, y + 8, 16, 40));
        }
      }
      return <path d={d.join('')} fill={color} opacity="0.26" />;
  }
}

/** Every glyph is drawn around (200, 260) and sits on the shadow at y≈372. */
function Glyph({ kind, fill, accent }) {
  const stroke = { stroke: INK, strokeWidth: 7, strokeLinejoin: 'round', strokeLinecap: 'round' };

  switch (kind) {
    case 'fabric':
      return (
        <g>
          <rect x="96" y="290" width="210" height="64" rx="18" fill={accent} {...stroke} />
          <rect x="108" y="228" width="196" height="64" rx="18" fill={fill} {...stroke} />
          <rect x="88" y="166" width="214" height="64" rx="18" fill={accent} {...stroke} />
          {[130, 170, 210, 250].map((x) => (
            <circle key={x} cx={x} cy="260" r="9" fill="none" stroke={accent} strokeWidth="5" />
          ))}
          {[120, 160, 200, 240, 280].map((x) => (
            <circle key={x} cx={x} cy="198" r="6" fill={fill} />
          ))}
        </g>
      );
    case 'dress':
      return (
        <path
          d="M170 140 Q200 160 230 140 L246 186 L232 200 L292 356 Q200 378 108 356 L168 200 L154 186 Z"
          fill={fill}
          {...stroke}
        />
      );
    case 'shoe':
      return (
        <g>
          <path
            d="M86 318 L96 238 Q120 226 150 246 L196 262 Q232 272 270 286 Q318 300 320 330 L320 344 L86 344 Z"
            fill={fill}
            {...stroke}
          />
          <path d="M86 330 L320 330" stroke={INK} strokeWidth="7" />
          <path d="M142 262 L132 288 M168 270 L158 296 M194 276 L186 300" stroke={accent} strokeWidth="7" strokeLinecap="round" />
        </g>
      );
    case 'bag':
      return (
        <g>
          <path d="M150 210 Q150 140 200 140 Q250 140 250 210" fill="none" {...stroke} />
          <path d="M108 206 L292 206 L306 352 Q200 370 94 352 Z" fill={fill} {...stroke} />
          <rect x="176" y="232" width="48" height="26" rx="8" fill={accent} {...stroke} strokeWidth="5" />
        </g>
      );
    case 'bottle':
      return (
        <g>
          <rect x="178" y="128" width="44" height="40" rx="8" fill={accent} {...stroke} />
          <path d="M162 168 L238 168 Q270 196 270 236 L270 340 Q270 356 254 356 L146 356 Q130 356 130 340 L130 236 Q130 196 162 168 Z" fill={fill} {...stroke} />
          <rect x="150" y="248" width="100" height="56" rx="10" fill={accent} {...stroke} strokeWidth="5" />
        </g>
      );
    case 'bowl':
      return (
        <g>
          <path d="M120 250 Q130 178 200 170 Q270 178 280 250 Z" fill={accent} {...stroke} />
          {[150, 180, 210, 240].map((x, i) => (
            <circle key={x} cx={x} cy={220 - (i % 2) * 14} r="9" fill="#d9472b" />
          ))}
          <path d="M92 250 L308 250 Q300 346 200 352 Q100 346 92 250 Z" fill={fill} {...stroke} />
        </g>
      );
    case 'cake':
      return (
        <g>
          <rect x="112" y="268" width="176" height="84" rx="12" fill={fill} {...stroke} />
          <rect x="136" y="200" width="128" height="70" rx="12" fill={accent} {...stroke} />
          <path d="M112 290 Q134 306 156 290 T200 290 T244 290 T288 290" fill="none" stroke={accent} strokeWidth="7" />
          <rect x="194" y="150" width="12" height="50" rx="5" fill="#fffaf2" {...stroke} strokeWidth="5" />
          <path d="M200 120 Q214 136 200 146 Q186 136 200 120 Z" fill="#f4b93e" stroke={INK} strokeWidth="4" />
        </g>
      );
    case 'phone':
      return (
        <g>
          <rect x="138" y="130" width="124" height="226" rx="24" fill={INK} {...stroke} />
          <rect x="150" y="150" width="100" height="176" rx="10" fill={fill} />
          <circle cx="200" cy="340" r="6" fill={accent} />
          <path d="M168 236 L192 260 L234 214" fill="none" stroke={accent} strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    case 'book':
      return (
        <g>
          <path d="M96 170 Q150 150 200 178 L200 352 Q150 326 96 346 Z" fill={fill} {...stroke} />
          <path d="M304 170 Q250 150 200 178 L200 352 Q250 326 304 346 Z" fill={accent} {...stroke} />
          <path d="M122 214 Q152 204 178 218 M122 248 Q152 238 178 252" stroke={accent} strokeWidth="6" fill="none" strokeLinecap="round" />
        </g>
      );
    case 'jewel':
      return (
        <g>
          <path d="M110 160 Q200 330 290 160" fill="none" stroke={INK} strokeWidth="7" />
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
            const t = i / 8;
            const x = 110 + 180 * t;
            const y = 160 + 4 * 85 * t * (1 - t);
            return <circle key={i} cx={x} cy={y} r={i === 4 ? 24 : 14} fill={i % 2 ? accent : fill} {...stroke} strokeWidth="5" />;
          })}
        </g>
      );
    default:
      return (
        <g>
          <rect x="112" y="220" width="176" height="132" rx="12" fill={fill} {...stroke} />
          <rect x="100" y="188" width="200" height="44" rx="10" fill={accent} {...stroke} />
          <rect x="188" y="188" width="24" height="164" fill={accent} stroke={INK} strokeWidth="5" />
          <path d="M200 188 Q160 140 150 168 Q146 190 200 188 Q254 190 250 168 Q240 140 200 188 Z" fill={accent} {...stroke} strokeWidth="6" />
        </g>
      );
  }
}

export default function ProductArt({ title, seed, className, label }) {
  const hash = hashString(seed ?? title);
  const palette = PALETTES[hash % PALETTES.length];
  const motif = (hash >>> 4) % 5;
  const kind = productKind(title);

  return (
    <svg
      className={className}
      viewBox="0 0 400 500"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={label ?? `Illustration of ${title}`}
    >
      <rect width="400" height="500" fill={palette.bg} />
      <Motif kind={motif} color={palette.motif} />
      <ellipse cx="200" cy="378" rx="128" ry="16" fill={INK} opacity="0.16" />
      <Glyph kind={kind} fill={palette.fill} accent={palette.accent} />
    </svg>
  );
}

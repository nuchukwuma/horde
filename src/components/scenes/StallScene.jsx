/**
 * The market stall: HordeMart's one recurring illustration.
 *
 * The same drawing tells three stories, controlled by props rather than by
 * three separate pictures, so the brand has one character instead of three
 * clip-art styles:
 *
 *   Landing — a seller stocks her stall; your shop name goes up on the sign.
 *   Signup  — the stall is built field by field as the form is filled in.
 *   Login   — a shuttered stall at night that rolls open when you sign in.
 *
 * `stage` (0–5) decides how much of the stall exists:
 *   0 an empty plot (a dashed outline), 1 the seller arrives, 2 the frame,
 *   awning and counter go up, 3 the shelves fill, 4 the shop's name goes on
 *   the sign, 5 the OPEN sign flips and the first order comes in.
 *
 * Every movement is a CSS transition on transform or opacity (scenes.css),
 * so changing `stage` is the animation — there is no timeline to manage, and
 * a reduced-motion user simply sees each finished state.
 *
 * Decorative: the meaningful content (the address, the order notification)
 * is repeated in text by whoever renders this, so the SVG is aria-hidden.
 */

const ITEMS_TOP = [
  // Adire fabric rolls
  {
    key: 'fabric',
    d: 0,
    node: (
      <g>
        <rect x="62" y="196" width="70" height="28" rx="11" fill="var(--indigo)" stroke="var(--line)" strokeWidth="3" />
        <rect x="70" y="170" width="62" height="28" rx="11" fill="#fffaf2" stroke="var(--line)" strokeWidth="3" />
        {[82, 98, 114].map((x) => (
          <circle key={x} cx={x} cy="210" r="5" fill="none" stroke="#fffaf2" strokeWidth="2.5" />
        ))}
        {[84, 100, 116].map((x) => (
          <circle key={x} cx={x} cy="184" r="3.5" fill="var(--indigo)" />
        ))}
      </g>
    ),
  },
  // Palm oil jars
  {
    key: 'jars',
    d: 1,
    node: (
      <g>
        {[150, 180, 210].map((x, i) => (
          <g key={x}>
            <rect x={x} y={192 - (i % 2) * 6} width="24" height={34 + (i % 2) * 6} rx="6" fill="var(--palm)" stroke="var(--line)" strokeWidth="3" />
            <rect x={x - 2} y={186 - (i % 2) * 6} width="28" height="9" rx="3" fill="var(--wood-dark)" stroke="var(--line)" strokeWidth="3" />
          </g>
        ))}
      </g>
    ),
  },
  // Basket of oranges
  {
    key: 'basket',
    d: 2,
    node: (
      <g>
        {[256, 272, 288, 264, 280].map((x, i) => (
          <circle key={i} cx={x} cy={i < 3 ? 196 : 184} r="9" fill="var(--sun)" stroke="var(--line)" strokeWidth="2.5" />
        ))}
        <path d="M242 200 L304 200 L296 226 L250 226 Z" fill="var(--wood)" stroke="var(--line)" strokeWidth="3" strokeLinejoin="round" />
        <path d="M250 210 L298 210" stroke="var(--wood-dark)" strokeWidth="3" />
      </g>
    ),
  },
  // Potted plant
  {
    key: 'plant',
    d: 3,
    node: (
      <g>
        <path d="M344 196 Q336 168 350 160 Q356 178 352 196 M356 196 Q362 162 378 164 Q372 184 360 196" fill="var(--leaf)" stroke="var(--line)" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M338 196 L374 196 L368 226 L344 226 Z" fill="var(--clay)" stroke="var(--line)" strokeWidth="3" strokeLinejoin="round" />
      </g>
    ),
  },
];

const ITEMS_BOTTOM = [
  // Sneakers
  {
    key: 'shoes',
    d: 4,
    node: (
      <g>
        <path d="M62 288 L66 262 Q76 258 86 266 L100 272 Q116 276 124 282 L124 290 L62 290 Z" fill="#fffaf2" stroke="var(--line)" strokeWidth="3" strokeLinejoin="round" />
        <path d="M78 270 L74 280 M88 274 L84 284" stroke="var(--palm)" strokeWidth="3" strokeLinecap="round" />
      </g>
    ),
  },
  // Handbag
  {
    key: 'bag',
    d: 5,
    node: (
      <g>
        <path d="M152 252 Q152 232 168 232 Q184 232 184 252" fill="none" stroke="var(--line)" strokeWidth="3" />
        <path d="M142 250 L194 250 L198 290 L138 290 Z" fill="var(--clay)" stroke="var(--line)" strokeWidth="3" strokeLinejoin="round" />
        <rect x="160" y="258" width="16" height="9" rx="3" fill="var(--sun)" stroke="var(--line)" strokeWidth="2" />
      </g>
    ),
  },
  // Boxes
  {
    key: 'boxes',
    d: 6,
    node: (
      <g>
        <rect x="216" y="258" width="44" height="32" rx="4" fill="var(--wood)" stroke="var(--line)" strokeWidth="3" />
        <rect x="226" y="232" width="36" height="28" rx="4" fill="var(--sun-wash)" stroke="var(--line)" strokeWidth="3" />
        <path d="M216 270 L260 270 M244 232 L244 260" stroke="var(--line)" strokeWidth="2" opacity="0.5" />
      </g>
    ),
  },
  // Clay pot
  {
    key: 'pot',
    d: 7,
    node: (
      <g>
        <path d="M300 252 L340 252 Q350 268 344 284 Q336 292 320 292 Q304 292 296 284 Q290 268 300 252 Z" fill="var(--wood)" stroke="var(--line)" strokeWidth="3" strokeLinejoin="round" />
        <path d="M296 266 Q320 274 344 266" stroke="var(--sun)" strokeWidth="3" fill="none" />
        <rect x="302" y="246" width="36" height="8" rx="3" fill="var(--wood-dark)" stroke="var(--line)" strokeWidth="3" />
      </g>
    ),
  },
];

/** Price tags that pop onto the shelf once the stock is in. */
const TAGS = [
  { x: 112, y: 160, d: 8 },
  { x: 236, y: 182, d: 9 },
  { x: 186, y: 230, d: 10 },
];

const ADIRE_DOTS = [];
for (let y = 180; y < 334; y += 28) {
  for (let x = 62; x < 384; x += 28) ADIRE_DOTS.push([x, y]);
}

function signFontSize(name) {
  if (name.length <= 10) return 30;
  if (name.length <= 15) return 25;
  return 20;
}

function on(stage, at) {
  return stage >= at ? ' on' : '';
}

export default function StallScene({
  name = 'Your shop',
  stage = 5,
  mood = 'day',
  shutter = 'none',
  lamp = false,
  className = '',
}) {
  const shown = (name || 'Your shop').trim().slice(0, 24) || 'Your shop';
  // A shuttered stall is not open, whatever stage it has reached.
  const isOpen = stage >= 5 && (shutter === 'none' || shutter === 'open');
  const fontSize = signFontSize(shown);
  const fitText = shown.length > 15 ? { textLength: 214, lengthAdjust: 'spacingAndGlyphs' } : {};

  return (
    <svg
      className={`stall stall--${mood}${lamp ? ' stall--lit' : ''} ${className}`}
      viewBox="0 0 600 510"
      aria-hidden="true"
      focusable="false"
      data-stage={stage}
    >
      {/* Everything sits 70 units down, leaving open sky at the top for the
          overlays (order toast, controls) so they never cover the sign. */}
      <g transform="translate(0 70)">
      {/* Sky */}
      {mood === 'night' ? (
        <g className="stall__stars">
          {[
            [60, 40], [150, 24], [230, 54], [450, 30], [560, 64], [520, 120], [96, 100],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 2.6 : 1.8} fill="#fff6dc" style={{ '--i': i }} />
          ))}
          <path d="M520 48 a26 26 0 1 0 22 40 a20 20 0 1 1 -22 -40 Z" fill="#fff1c4" />
        </g>
      ) : (
        <g>
          <circle className="stall__sun" cx="540" cy="0" r="34" fill="var(--sun)" />
          <g className="stall__cloud" fill="var(--surface-1)" opacity="0.9">
            <ellipse cx="300" cy="10" rx="34" ry="12" />
            <ellipse cx="320" cy="2" rx="22" ry="14" />
          </g>
        </g>
      )}

      {/* Ground */}
      <rect x="0" y="388" width="600" height="52" fill="var(--surface-inset)" />
      <path d="M0 388 H600" stroke="var(--line)" strokeWidth="3" opacity="0.8" />

      {/* Blueprint: the plot before anything is built */}
      <g className={`stall__blueprint${stage < 2 ? ' on' : ''}`}>
        <rect x="24" y="110" width="388" height="278" rx="8" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeDasharray="10 9" />
        <text x="218" y="256" textAnchor="middle" className="stall__blueprint-text">
          your stall goes here
        </text>
      </g>

      {/* Frame: posts, back wall, shelves */}
      <g className={`stall__part${on(stage, 2)}`} style={{ '--d': '0ms' }}>
        <rect className="stall__wall" x="48" y="166" width="336" height="168" fill="var(--indigo-wash)" />
        {/* Adire dots on the back wall. Plain shapes, not a <pattern>: no ids,
            so two copies of this scene on one page cannot collide. */}
        <g opacity="0.28">
          {ADIRE_DOTS.map(([x, y]) => (
            <g key={`${x}-${y}`}>
              <circle cx={x} cy={y} r="8" fill="none" stroke="var(--indigo)" strokeWidth="2" />
              <circle cx={x} cy={y} r="2" fill="var(--indigo)" />
            </g>
          ))}
        </g>
        <rect x="34" y="96" width="14" height="292" rx="3" fill="var(--wood)" stroke="var(--line)" strokeWidth="3" />
        <rect x="384" y="96" width="14" height="292" rx="3" fill="var(--wood)" stroke="var(--line)" strokeWidth="3" />
      </g>

      <g className={`stall__part${on(stage, 3)}`} style={{ '--d': '0ms' }}>
        <rect x="48" y="224" width="336" height="9" rx="2" fill="var(--wood-dark)" stroke="var(--line)" strokeWidth="2.5" />
        <rect x="48" y="288" width="336" height="9" rx="2" fill="var(--wood-dark)" stroke="var(--line)" strokeWidth="2.5" />
      </g>

      {/* Stock, dropped onto the shelves one at a time */}
      <g className={`stall__stock${on(stage, 3)}`}>
        {[...ITEMS_TOP, ...ITEMS_BOTTOM].map((item) => (
          <g key={item.key} className="stall__item" style={{ '--d': `${item.d * 140}ms` }}>
            {item.node}
          </g>
        ))}
        {TAGS.map((tag) => (
          <g key={tag.d} className="stall__tag" style={{ '--d': `${tag.d * 140}ms` }}>
            <path
              d={`M${tag.x} ${tag.y} l24 0 l8 9 l-8 9 l-24 0 Z`}
              fill="var(--sun)"
              stroke="var(--line)"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            <text x={tag.x + 12} y={tag.y + 13.5} textAnchor="middle" className="stall__tag-text">
              ₦
            </text>
          </g>
        ))}
      </g>

      {/* Shutter (login only): rolls up into the awning */}
      {shutter !== 'none' ? (
        <g
          className={`stall__shutter${shutter === 'open' ? ' is-open' : ''}${
            shutter === 'shake' ? ' is-shaking' : ''
          }`}
        >
          <rect x="48" y="150" width="336" height="184" fill="#8f9aa8" stroke="var(--line)" strokeWidth="3" />
          {Array.from({ length: 11 }, (_, i) => (
            <path key={i} d={`M48 ${166 + i * 16} H384`} stroke="#6f7a88" strokeWidth="3" />
          ))}
          <rect x="196" y="318" width="40" height="10" rx="3" fill="#56606d" />
          <text x="216" y="232" textAnchor="middle" className="stall__chalk">
            back soon
          </text>
          <text x="216" y="268" textAnchor="middle" className="stall__chalk stall__chalk--small">
            sign in to open up
          </text>
        </g>
      ) : null}

      {/* Awning */}
      <g className={`stall__part stall__awning${on(stage, 2)}`} style={{ '--d': '120ms' }}>
        {Array.from({ length: 7 }, (_, i) => {
          const x = 20 + i * 56;
          const fill = i % 2 === 0 ? 'var(--accent)' : '#fffaf2';
          return (
            <g key={i}>
              <rect x={x} y="110" width="56" height="40" fill={fill} />
              <path d={`M${x} 150 a28 15 0 0 0 56 0 Z`} fill={fill} />
            </g>
          );
        })}
        <path
          d={`M20 110 H412 V150 ${Array.from({ length: 7 }, (_, i) => `a28 15 0 0 1 -56 0`).join(' ')} Z`}
          fill="none"
          stroke="var(--line)"
          strokeWidth="3"
          strokeLinejoin="round"
        />
      </g>

      {/* Lamp */}
      <g className={`stall__part${on(stage, 2)}`} style={{ '--d': '220ms' }}>
        <g className="stall__glow">
          <circle cx="216" cy="196" r="90" fill="#ffd77a" opacity="0.12" />
          <circle cx="216" cy="196" r="62" fill="#ffd77a" opacity="0.16" />
          <circle cx="216" cy="196" r="36" fill="#ffd77a" opacity="0.22" />
        </g>
        <path d="M216 165 V178" stroke="var(--line)" strokeWidth="3" />
        <path d="M204 178 H228 L222 192 H210 Z" fill="var(--surface-ink)" />
        <circle className="stall__bulb" cx="216" cy="196" r="6" />
      </g>

      {/* Sign with the shop's name */}
      <g className={`stall__part stall__sign${on(stage, 2)}`} style={{ '--d': '60ms' }}>
        <path d="M120 96 V110 M312 96 V110" stroke="var(--line)" strokeWidth="3" />
        <rect x="100" y="52" width="232" height="50" rx="10" fill="#fffaf2" stroke="var(--line)" strokeWidth="3.5" />
        <text
          x="216"
          y={78 + fontSize * 0.34}
          textAnchor="middle"
          className={`stall__name${on(stage, 4)}`}
          style={{ fontSize }}
          {...fitText}
        >
          {shown}
        </text>
      </g>

      {/* Sparkles once the shop is open */}
      <g className={`stall__sparkles${isOpen ? ' on' : ''}`}>
        {[
          [90, 58, 0],
          [346, 46, 1],
          [362, 104, 2],
          [70, 116, 3],
        ].map(([x, y, i]) => (
          <path
            key={i}
            d={`M${x} ${y - 11} L${x + 3} ${y - 3} L${x + 11} ${y} L${x + 3} ${y + 3} L${x} ${y + 11} L${x - 3} ${y + 3} L${x - 11} ${y} L${x - 3} ${y - 3} Z`}
            fill="var(--sun)"
            stroke="var(--line)"
            strokeWidth="2"
            style={{ '--i': i }}
          />
        ))}
      </g>

      {/* Counter */}
      <g className={`stall__part${on(stage, 2)}`} style={{ '--d': '180ms' }}>
        <rect x="20" y="330" width="392" height="58" rx="6" fill="var(--wood)" stroke="var(--line)" strokeWidth="3" />
        <rect x="20" y="342" width="392" height="9" fill="var(--palm)" />
        <rect x="20" y="356" width="392" height="9" fill="var(--sun)" />
        <rect x="20" y="370" width="392" height="9" fill="var(--accent)" />
        <rect x="20" y="330" width="392" height="58" rx="6" fill="none" stroke="var(--line)" strokeWidth="3" />
      </g>

      {/* OPEN sign, hung on the right post */}
      <g className={`stall__part stall__open${on(stage, 2)}${isOpen ? ' is-open' : ''}`} style={{ '--d': '260ms' }}>
        <path d="M398 166 L420 150 L442 166" fill="none" stroke="var(--line)" strokeWidth="2.5" />
        <g className="stall__open-card">
          <rect x="402" y="166" width="78" height="34" rx="7" className="stall__open-bg" stroke="var(--line)" strokeWidth="3" />
          <text x="441" y="189" textAnchor="middle" className="stall__open-text">
            {isOpen ? 'OPEN' : 'SOON'}
          </text>
        </g>
      </g>

      {/* The seller */}
      <g className={`stall__seller${on(stage, 1)}${stage === 3 ? ' is-stocking' : ''}${isOpen ? ' is-waving' : ''}`}>
        <g className="stall__seller-body">
          {/* dress */}
          <path d="M488 268 Q520 258 552 268 L572 388 L468 388 Z" fill="var(--indigo)" stroke="var(--line)" strokeWidth="3" strokeLinejoin="round" />
          {[492, 512, 532, 552, 500, 520, 540].map((x, i) => (
            <circle key={i} cx={x} cy={i < 4 ? 320 : 352} r="4.5" fill="var(--sun)" />
          ))}
          {/* neck + head */}
          <rect x="511" y="242" width="18" height="22" rx="6" fill="var(--skin-1)" />
          <circle cx="520" cy="230" r="24" fill="var(--skin-1)" stroke="var(--line)" strokeWidth="3" />
          <circle cx="512" cy="232" r="2.6" fill="var(--line)" />
          <circle cx="529" cy="232" r="2.6" fill="var(--line)" />
          <path d="M512 242 Q520 249 529 242" stroke="var(--line)" strokeWidth="2.6" fill="none" strokeLinecap="round" />
          {/* gele */}
          <path d="M492 222 Q494 192 520 190 Q550 190 550 220 Q536 208 520 210 Q504 210 492 222 Z" fill="var(--palm)" stroke="var(--line)" strokeWidth="3" strokeLinejoin="round" />
          <path d="M540 196 Q566 178 562 204 Q556 214 544 206" fill="var(--palm)" stroke="var(--line)" strokeWidth="3" strokeLinejoin="round" />
          {/* left arm holding a box */}
          <g className="stall__arm-left">
            <path d="M494 276 Q470 300 476 320" stroke="var(--skin-1)" strokeWidth="13" fill="none" strokeLinecap="round" />
            <rect x="452" y="300" width="44" height="34" rx="4" fill="var(--sun-wash)" stroke="var(--line)" strokeWidth="3" />
            <path d="M452 312 H496" stroke="var(--line)" strokeWidth="2" opacity="0.5" />
          </g>
          {/* right arm, the waving one */}
          <g className="stall__arm-right">
            <path d="M548 276 Q574 256 576 230" stroke="var(--skin-1)" strokeWidth="13" fill="none" strokeLinecap="round" />
            <circle cx="577" cy="224" r="9" fill="var(--skin-1)" stroke="var(--line)" strokeWidth="2.5" />
          </g>
        </g>
      </g>
      </g>
    </svg>
  );
}

/**
 * An adire cloth, dyed from a shop's name.
 *
 * Adire eleko is drawn in starch paste before the cloth goes into the indigo
 * vat; wherever the paste sits, the dye cannot reach, and the pale motif is
 * what stays behind. Its vocabulary is small and specific — concentric
 * circles (oniko), parallel stitch lines (alabere), ladders, dotted fields,
 * leaves, crossed squares — repeated in a grid of hand-drawn squares.
 *
 * Here each letter of the name picks a motif and a turn for one square of the
 * grid, so "Ade Stores" and "Mama Nkechi Foods" get visibly different cloth,
 * and the same name always gets the same cloth (server and browser agree, so
 * nothing shifts on hydration).
 *
 * Plain SVG shapes, no <pattern> ids — so any number of these can sit on one
 * page, and nothing for the CSP to object to.
 */

const MOTIFS = ['oniko', 'alabere', 'ladder', 'dots', 'leaf', 'cross'];

function codeAt(text, i) {
  if (!text) return 7 + i * 13;
  return text.charCodeAt(i % text.length) + i * 31;
}

/** The grid for a name: one motif and one rotation per square. */
export function adireTiles(name, count = 12) {
  const text = String(name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return Array.from({ length: count }, (_, i) => {
    const code = codeAt(text, i);
    return {
      motif: MOTIFS[code % MOTIFS.length],
      turn: (code >> 2) % 4,
    };
  });
}

export function AdireMotif({ motif, resist }) {
  const stroke = { stroke: resist, strokeWidth: 3.2, fill: 'none', strokeLinecap: 'round' };
  switch (motif) {
    case 'oniko':
      return (
        <g {...stroke}>
          <circle cx="25" cy="25" r="16" />
          <circle cx="25" cy="25" r="9" />
          <circle cx="25" cy="25" r="2.4" fill={resist} />
        </g>
      );
    case 'alabere':
      return (
        <g {...stroke}>
          {[12, 20, 28, 36].map((y) => (
            <path key={y} d={`M8 ${y} q4 -3 8 0 t8 0 t8 0 t8 0`} />
          ))}
        </g>
      );
    case 'ladder':
      return (
        <g {...stroke}>
          <path d="M14 7 V43 M36 7 V43" />
          {[13, 21, 29, 37].map((y) => (
            <path key={y} d={`M14 ${y} H36`} />
          ))}
        </g>
      );
    case 'dots':
      return (
        <g fill={resist}>
          {[11, 25, 39].flatMap((x) => [11, 25, 39].map((y) => <circle key={`${x}${y}`} cx={x} cy={y} r={x === 25 && y === 25 ? 4.4 : 2.6} />))}
        </g>
      );
    case 'leaf':
      return (
        <g {...stroke}>
          <path d="M25 6 C40 16 40 34 25 44 C10 34 10 16 25 6 Z" />
          <path d="M25 10 V40 M25 20 l-6 -4 M25 20 l6 -4 M25 30 l-7 -4 M25 30 l7 -4" />
        </g>
      );
    default:
      return (
        <g {...stroke}>
          <rect x="9" y="9" width="32" height="32" rx="2" />
          <path d="M9 9 L41 41 M41 9 L9 41" />
        </g>
      );
  }
}

/**
 * @param name     the shop name the cloth is dyed from
 * @param columns  squares per row; rows follow from `count`
 * @param ink      the dye colour (the ground)
 * @param resist   the colour the paste kept (the motif)
 */
export default function AdirePattern({
  name,
  columns = 4,
  count = 12,
  ink = 'var(--indigo)',
  resist = '#f4f1e6',
  className,
  tileClassName = 'adire__tile',
}) {
  const tiles = adireTiles(name, count);
  const rows = Math.ceil(count / columns);

  return (
    <svg
      className={className}
      viewBox={`0 0 ${columns * 50} ${rows * 50}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <rect width={columns * 50} height={rows * 50} fill={ink} />
      {tiles.map((tile, i) => {
        const x = (i % columns) * 50;
        const y = Math.floor(i / columns) * 50;
        return (
          <g key={`${i}-${tile.motif}-${tile.turn}`} transform={`translate(${x} ${y})`}>
            <g className={tileClassName} style={{ '--i': i }} transform={`rotate(${tile.turn * 90} 25 25)`}>
              <AdireMotif motif={tile.motif} resist={resist} />
            </g>
            {/* The hand-drawn grid between squares. */}
            <rect x="0.5" y="0.5" width="49" height="49" fill="none" stroke={resist} strokeWidth="0.8" opacity="0.35" />
          </g>
        );
      })}
    </svg>
  );
}

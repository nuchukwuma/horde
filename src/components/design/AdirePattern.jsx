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

import { circlePath, rectPath } from '@/lib/ui/svgPath';

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
  // One path per motif where the strokes match (lib/ui/svgPath): the same
  // marks with far fewer elements, since a hero cloth repeats 30 squares.
  const stroke = { stroke: resist, strokeWidth: 3.2, fill: 'none', strokeLinecap: 'round' };
  switch (motif) {
    case 'oniko':
      return (
        <>
          <path d={circlePath(25, 25, 16) + circlePath(25, 25, 9)} {...stroke} />
          {/* The dot carries the stroke too, as it did inside the stroked group. */}
          <path d={circlePath(25, 25, 2.4)} {...stroke} fill={resist} />
        </>
      );
    case 'alabere':
      return <path d={[12, 20, 28, 36].map((y) => `M8 ${y} q4 -3 8 0 t8 0 t8 0 t8 0`).join('')} {...stroke} />;
    case 'ladder':
      return <path d={`M14 7 V43 M36 7 V43${[13, 21, 29, 37].map((y) => ` M14 ${y} H36`).join('')}`} {...stroke} />;
    case 'dots':
      return (
        <path
          d={[11, 25, 39].flatMap((x) => [11, 25, 39].map((y) => circlePath(x, y, x === 25 && y === 25 ? 4.4 : 2.6))).join('')}
          fill={resist}
        />
      );
    case 'leaf':
      return <path d="M25 6 C40 16 40 34 25 44 C10 34 10 16 25 6 Z M25 10 V40 M25 20 l-6 -4 M25 20 l6 -4 M25 30 l-7 -4 M25 30 l7 -4" {...stroke} />;
    default:
      return <path d="M11 9h28a2 2 0 0 1 2 2v28a2 2 0 0 1 -2 2h-28a2 2 0 0 1 -2 -2v-28a2 2 0 0 1 2 -2z M9 9 L41 41 M41 9 L9 41" {...stroke} />;
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
        // Two groups on purpose: the landing animates .adire__tile's
        // transform, which would otherwise replace the translate.
        return (
          <g key={`${i}-${tile.motif}-${tile.turn}`} transform={`translate(${x} ${y})`}>
            <g className={tileClassName} style={{ '--i': i }} transform={`rotate(${tile.turn * 90} 25 25)`}>
              <AdireMotif motif={tile.motif} resist={resist} />
            </g>
          </g>
        );
      })}
      {/* The hand-drawn grid between squares, as one path. */}
      <path
        d={tiles.map((_, i) => rectPath((i % columns) * 50 + 0.5, Math.floor(i / columns) * 50 + 0.5, 49, 49)).join('')}
        fill="none"
        stroke={resist}
        strokeWidth="0.8"
        opacity="0.35"
      />
    </svg>
  );
}

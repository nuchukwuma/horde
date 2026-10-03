/**
 * Many shapes as one SVG path.
 *
 * The generated art (ProductArt, AdirePattern) repeats a motif hundreds of
 * times. As separate <circle>/<rect> elements that was 80% of a store page's
 * elements, sent twice (HTML, then again in the React payload) and walked
 * during hydration. One <path> per colour draws exactly the same thing.
 */

const n = (value: number) => String(Math.round(value * 100) / 100);

/** A full circle as two arcs, same geometry as <circle cx cy r>. */
export function circlePath(cx: number, cy: number, r: number): string {
  return `M${n(cx - r)} ${n(cy)}a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0`;
}

/** A rectangle, same geometry as <rect x y width height>. */
export function rectPath(x: number, y: number, width: number, height: number): string {
  return `M${n(x)} ${n(y)}h${n(width)}v${n(height)}h${n(-width)}z`;
}

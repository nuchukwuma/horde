'use client';

import { useId, useMemo, useState } from 'react';
import { formatNaira, formatNairaCompact, formatDate } from '@/lib/ui/format';

/**
 * Revenue over time.
 *
 * Form: the job is trend-over-time across two distinct series, so a multi-line
 * chart with a categorical palette. Not a dual axis — both series are naira on
 * one scale, which is the whole reason they can share a chart.
 *
 * Colours are the validated data-viz slots 1 and 2, read from CSS custom
 * properties so light and dark each use their own validated step. Do not
 * hand-pick replacements; run the palette validator.
 *
 * Marks follow the spec: 2px lines with round joins, >=8px end markers carrying
 * a 2px surface ring, hairline solid gridlines, no number on every point.
 */

const WIDTH = 760;
const HEIGHT = 260;
/**
 * Axis labels sit left of the plot, the endpoint direct label right of it.
 * Both were on the right in the first cut and collided in the top corner —
 * caught by screenshotting the chart rather than by reading the code.
 */
const PADDING = { top: 20, right: 78, bottom: 30, left: 62 };

export default function RevenueChart({ points, title = 'Revenue', subtitle }) {
  const titleId = useId();
  const [hoverIndex, setHoverIndex] = useState(null);

  const geometry = useMemo(() => {
    if (!points || points.length === 0) return null;

    const maxValue = Math.max(
      1,
      ...points.map((point) => Math.max(point.grossKobo, point.netKobo)),
    );

    const innerWidth = WIDTH - PADDING.left - PADDING.right;
    const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;

    const x = (index) =>
      points.length === 1
        ? PADDING.left + innerWidth / 2
        : PADDING.left + (index / (points.length - 1)) * innerWidth;

    const y = (value) => PADDING.top + innerHeight - (value / maxValue) * innerHeight;

    const line = (key) =>
      points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index)},${y(point[key])}`).join(' ');

    return {
      x,
      y,
      maxValue,
      innerHeight,
      grossPath: line('grossKobo'),
      netPath: line('netKobo'),
      // Three gridlines is enough to read a level without becoming furniture.
      ticks: [0, 0.5, 1].map((fraction) => ({
        value: maxValue * fraction,
        y: PADDING.top + innerHeight - fraction * innerHeight,
      })),
    };
  }, [points]);

  if (!geometry) {
    return (
      <section className="chart" aria-labelledby={titleId}>
        <header className="chart__head">
          <div>
            <h2 className="chart__title" id={titleId}>
              {title}
            </h2>
            {subtitle ? <p className="chart__subtitle">{subtitle}</p> : null}
          </div>
        </header>
        <p className="empty">No sales in this period yet.</p>
      </section>
    );
  }

  const last = points.length - 1;
  const active = hoverIndex === null ? null : points[hoverIndex];

  return (
    <section className="chart" aria-labelledby={titleId}>
      <header className="chart__head">
        <div>
          <h2 className="chart__title" id={titleId}>
            {title}
          </h2>
          {subtitle ? <p className="chart__subtitle">{subtitle}</p> : null}
        </div>

        {/* A legend is always present for two or more series. */}
        <div className="legend">
          <span className="legend__item">
            <span className="legend__swatch" style={{ background: 'var(--series-1)' }} />
            Gross sales
          </span>
          <span className="legend__item">
            <span className="legend__swatch" style={{ background: 'var(--series-2)' }} />
            Your net
          </span>
        </div>
      </header>

      <svg
        className="chart__svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-labelledby={titleId}
        onMouseLeave={() => setHoverIndex(null)}
      >
        {geometry.ticks.map((tick) => (
          <g key={tick.y}>
            <line
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={tick.y}
              y2={tick.y}
              stroke="var(--grid)"
              strokeWidth="1"
            />
            <text
              x={PADDING.left - 10}
              y={tick.y + 4}
              fontSize="11"
              fill="var(--text-muted)"
              textAnchor="end"
            >
              {formatNairaCompact(tick.value)}
            </text>
          </g>
        ))}

        <path
          d={geometry.grossPath}
          fill="none"
          stroke="var(--series-1)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d={geometry.netPath}
          fill="none"
          stroke="var(--series-2)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* End markers: >=8px with a 2px surface ring so they stay legible where
            the two lines cross. */}
        {['grossKobo', 'netKobo'].map((key, seriesIndex) => (
          <circle
            key={key}
            cx={geometry.x(last)}
            cy={geometry.y(points[last][key])}
            r="4.5"
            fill={`var(--series-${seriesIndex + 1})`}
            stroke="var(--surface-1)"
            strokeWidth="2"
          />
        ))}

        {/* Selective direct label: the endpoint only, never a number on every point. */}
        <text
          x={geometry.x(last) + 10}
          y={geometry.y(points[last].netKobo) + 4}
          fontSize="11.5"
          fontWeight="600"
          fill="var(--text-secondary)"
        >
          {formatNairaCompact(points[last].netKobo)}
        </text>

        {active ? (
          <line
            x1={geometry.x(hoverIndex)}
            x2={geometry.x(hoverIndex)}
            y1={PADDING.top}
            y2={PADDING.top + geometry.innerHeight}
            stroke="var(--border-strong)"
            strokeWidth="1"
          />
        ) : null}

        {/* Invisible hit targets, wider than the marks, so hovering is easy. */}
        {points.map((point, index) => (
          <rect
            key={point.label}
            x={geometry.x(index) - 14}
            y={PADDING.top}
            width="28"
            height={geometry.innerHeight}
            fill="transparent"
            onMouseEnter={() => setHoverIndex(index)}
          />
        ))}

        <text
          x={PADDING.left}
          y={HEIGHT - 8}
          fontSize="11"
          fill="var(--text-muted)"
        >
          {points[0].label}
        </text>
        <text
          x={WIDTH - PADDING.right}
          y={HEIGHT - 8}
          fontSize="11"
          fill="var(--text-muted)"
          textAnchor="end"
        >
          {points[last].label}
        </text>
      </svg>

      {active ? (
        <div className="inset" style={{ marginTop: 12 }}>
          <strong style={{ fontSize: 13 }}>{formatDate(active.date)}</strong>
          <div className="row" style={{ gap: 20, marginTop: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13 }}>
              Gross <span className="money">{formatNaira(active.grossKobo)}</span>
            </span>
            <span style={{ fontSize: 13 }}>
              Net <span className="money">{formatNaira(active.netKobo)}</span>
            </span>
          </div>
        </div>
      ) : null}

      {/* Identity is never colour-alone: a table view carries the same data. */}
      <details style={{ marginTop: 12 }}>
        <summary style={{ fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
          View as table
        </summary>
        <div className="table-wrap" style={{ marginTop: 10 }}>
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col" className="num">
                  Gross
                </th>
                <th scope="col" className="num">
                  Your net
                </th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.label}>
                  <td>{formatDate(point.date)}</td>
                  <td className="num money">{formatNaira(point.grossKobo)}</td>
                  <td className="num money">{formatNaira(point.netKobo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

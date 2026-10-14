import styles from './BarChart.module.css';

export type BarSeries = {
  label: string;
  /** A CSS color, e.g. `var(--color-fuchsia)`. */
  color: string;
  values: number[];
};

// Close to the width the chart is shown at (a half-width panel), so 11px text stays readable.
const WIDTH = 400;
const HEIGHT = 200;
const PAD = { top: 10, right: 4, bottom: 24, left: 26 };

/** Up to 4 round steps (1, 2, 5 × 10ⁿ) covering `max`. */
function ticks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? power * 10;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: top / step + 1 }, (_, index) => index * step);
}

/**
 * Stacked bar chart drawn on the server as SVG: no script, no chart library. The numbers are also
 * in a visually hidden table, which is what screen readers get.
 */
export function BarChart({
  title,
  labels,
  longLabels = labels,
  rowHeading,
  series,
}: {
  /** Names the chart for assistive technology and labels the hidden table. */
  title: string;
  /** Short axis labels, one per bar. */
  labels: string[];
  /** Full labels for the hidden table (e.g. "October 2026" for "Oct"). */
  longLabels?: string[];
  /** Heading of the hidden table's first column, e.g. "Month". */
  rowHeading: string;
  series: BarSeries[];
}) {
  const totals = labels.map((_, index) =>
    series.reduce((sum, item) => sum + (item.values[index] ?? 0), 0),
  );
  const scale = ticks(Math.max(...totals, 0));
  const top = scale.at(-1) ?? 1;
  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const slot = plotWidth / Math.max(labels.length, 1);
  const barWidth = Math.min(20, slot * 0.62);
  const y = (value: number) => PAD.top + plotHeight - (value / top) * plotHeight;

  return (
    <figure className={styles.figure}>
      <svg
        className={styles.svg}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        aria-hidden="true"
        focusable="false"
      >
        {scale.map((tick) => (
          <g key={tick}>
            <line
              className={styles.grid}
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text className={styles.axisLabel} x={PAD.left - 6} y={y(tick) + 4} textAnchor="end">
              {tick}
            </text>
          </g>
        ))}
        {labels.map((label, index) => {
          const x = PAD.left + slot * index + (slot - barWidth) / 2;
          let base = 0;
          return (
            <g key={longLabels[index] ?? index}>
              {series.map((item) => {
                const value = item.values[index] ?? 0;
                if (value <= 0) return null;
                const rect = (
                  <rect
                    key={item.label}
                    x={x}
                    y={y(base + value)}
                    width={barWidth}
                    height={y(base) - y(base + value)}
                    rx={3}
                    fill={item.color}
                  />
                );
                base += value;
                return rect;
              })}
              <text
                className={styles.axisLabel}
                x={x + barWidth / 2}
                y={HEIGHT - 8}
                textAnchor="middle"
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>
      <ul className={styles.legend} aria-hidden="true">
        {series.map((item) => (
          <li key={item.label}>
            <span className={styles.swatch} style={{ background: item.color }} />
            {item.label}
          </li>
        ))}
      </ul>
      <table className="visually-hidden">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">{rowHeading}</th>
            {series.map((item) => (
              <th key={item.label} scope="col">
                {item.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {longLabels.map((label, index) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              {series.map((item) => (
                <td key={item.label}>{item.values[index] ?? 0}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

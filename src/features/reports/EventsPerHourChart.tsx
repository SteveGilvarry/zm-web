import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { DailyBucket } from './bucketEventsByHour';
import { formatDateLabel } from './bucketEventsByHour';

interface EventsPerHourChartProps {
  buckets: DailyBucket[];
  /** Optional accessible title for screen readers. */
  ariaLabel?: string;
}

/**
 * Tiny SVG line chart — one polyline per day, x = hour-of-day (0..23),
 * y = sum of event length in seconds. Drawn without a third-party charting
 * dep because the dashboard only renders one of these and adding Recharts
 * / Chart.js would bloat the bundle (~150KB+) for a single route.
 *
 * Layout: 800x300 viewBox, scales-on-resize via `preserveAspectRatio`.
 * Datasets get a stable colour by index (cyan / amber / emerald / crimson
 * / purple / pink, then cycles).
 */
export function EventsPerHourChart({ buckets, ariaLabel }: EventsPerHourChartProps) {
  const { t } = useTranslation();
  const { width, height, padding } = LAYOUT;

  const yMax = useMemo(() => {
    let max = 0;
    for (const b of buckets) {
      for (const v of b.seconds) {
        if (v > max) max = v;
      }
    }
    // Round up to a nice 5 / 10 / 100 / etc. so axis labels look tidy.
    return niceMax(max);
  }, [buckets]);

  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  // X position for hour h ∈ [0..23] — evenly spread across the chart.
  const xFor = (h: number) => padding.left + (innerW * h) / 23;
  // Y position for value v — yMax at top, 0 at bottom.
  const yFor = (v: number) =>
    padding.top + innerH - (yMax === 0 ? 0 : (v / yMax) * innerH);

  const yTicks = makeYTicks(yMax);

  return (
    <div className="w-full" data-testid="events-per-hour-chart" dir="ltr">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-auto text-text-muted"
        role="img"
        aria-label={ariaLabel ?? t('Events per hour, grouped by date')}
      >
        {/* Grid + axes */}
        {yTicks.map((tick) => {
          const y = yFor(tick);
          return (
            <g key={`y-${tick}`}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                stroke="currentColor"
                strokeOpacity={0.15}
                strokeWidth={1}
              />
              <text
                x={padding.left - 6}
                y={y + 3}
                textAnchor="end"
                fontSize="10"
                fill="currentColor"
                className="font-mono"
              >
                {formatSeconds(tick)}
              </text>
            </g>
          );
        })}

        {/* X axis labels — every 3 hours to avoid clutter. */}
        {Array.from({ length: 24 }, (_, h) => h).map((h) => {
          if (h % 3 !== 0) return null;
          return (
            <text
              key={`x-${h}`}
              x={xFor(h)}
              y={height - padding.bottom + 14}
              textAnchor="middle"
              fontSize="10"
              fill="currentColor"
              className="font-mono"
            >
              {h}:00
            </text>
          );
        })}

        {/* Datasets — one polyline per date. */}
        {buckets.map((b, idx) => {
          const colour = PALETTE[idx % PALETTE.length];
          const points = b.seconds
            .map((v, h) => `${xFor(h)},${yFor(v)}`)
            .join(' ');
          return (
            <g key={b.date}>
              <polyline
                fill="none"
                stroke={colour}
                strokeWidth={1.5}
                points={points}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {b.seconds.map((v, h) =>
                v > 0 ? (
                  <circle
                    key={`${b.date}-${h}`}
                    cx={xFor(h)}
                    cy={yFor(v)}
                    r={2}
                    fill={colour}
                  >
                    <title>
                      {t('{{date}} {{hour}}:00 — {{duration}}', {
                        date: formatDateLabel(b.date),
                        hour: h,
                        duration: formatSeconds(v),
                      })}
                    </title>
                  </circle>
                ) : null,
              )}
            </g>
          );
        })}

        {/* Axis baseline */}
        <line
          x1={padding.left}
          y1={padding.top + innerH}
          x2={width - padding.right}
          y2={padding.top + innerH}
          stroke="currentColor"
          strokeOpacity={0.4}
          strokeWidth={1}
        />
        <line
          x1={padding.left}
          y1={padding.top}
          x2={padding.left}
          y2={padding.top + innerH}
          stroke="currentColor"
          strokeOpacity={0.4}
          strokeWidth={1}
        />
      </svg>

      {/* Legend */}
      <ul
        className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] font-mono text-text-secondary"
        aria-label={t('Chart legend')}
      >
        {buckets.map((b, idx) => (
          <li key={b.date} className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-0.5"
              style={{ backgroundColor: PALETTE[idx % PALETTE.length] }}
            />
            {formatDateLabel(b.date)}
          </li>
        ))}
      </ul>
    </div>
  );
}

const LAYOUT = {
  width: 800,
  height: 280,
  padding: { top: 12, right: 16, bottom: 28, left: 56 },
} as const;

const PALETTE = [
  '#00d4ff', // cyan
  '#fbbf24', // amber
  '#34d399', // emerald
  '#f87171', // crimson
  '#c084fc', // purple
  '#f472b6', // pink
  '#60a5fa', // blue
  '#a3e635', // lime
];

function niceMax(raw: number): number {
  if (raw <= 0) return 1;
  if (raw <= 5) return 5;
  if (raw <= 10) return 10;
  if (raw <= 60) return Math.ceil(raw / 10) * 10;
  if (raw <= 600) return Math.ceil(raw / 60) * 60;
  if (raw <= 3600) return Math.ceil(raw / 300) * 300;
  return Math.ceil(raw / 600) * 600;
}

function makeYTicks(max: number): number[] {
  if (max <= 0) return [0];
  // 4 evenly-spaced gridlines plus 0.
  const step = max / 4;
  return [0, step, step * 2, step * 3, max];
}

function formatSeconds(v: number): string {
  if (v >= 3600) return `${(v / 3600).toFixed(1)}h`;
  if (v >= 60) return `${(v / 60).toFixed(0)}m`;
  return `${Math.round(v)}s`;
}

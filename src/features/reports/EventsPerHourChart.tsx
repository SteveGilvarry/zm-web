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
 *
 * The lines are data, not state, so they are all drawn in the foreground
 * colour and told apart by weight, opacity and dash pattern rather than by
 * hue — that keeps the only saturated thing on a reports page a threshold
 * someone actually has to act on (docs/DESIGN.md).
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
        className="w-full h-auto text-fg-muted"
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
          const series = seriesStyle(idx);
          const points = b.seconds
            .map((v, h) => `${xFor(h)},${yFor(v)}`)
            .join(' ');
          return (
            <g key={b.date} stroke="currentColor" fill="currentColor" opacity={series.opacity}>
              <polyline
                fill="none"
                strokeWidth={series.width}
                strokeDasharray={series.dash}
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
                    stroke="none"
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

      {/* Legend — each swatch repeats its series' weight, opacity and dash so
          the line can be identified without relying on colour. */}
      <ul
        className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-fg-muted"
        aria-label={t('Chart legend')}
      >
        {buckets.map((b, idx) => {
          const series = seriesStyle(idx);
          return (
            <li key={b.date} className="flex items-center gap-1.5">
              <svg width={16} height={6} aria-hidden className="shrink-0 text-fg-muted">
                <line
                  x1={0}
                  y1={3}
                  x2={16}
                  y2={3}
                  stroke="currentColor"
                  strokeWidth={series.width}
                  strokeDasharray={series.dash}
                  opacity={series.opacity}
                />
              </svg>
              {formatDateLabel(b.date)}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const LAYOUT = {
  width: 800,
  height: 280,
  padding: { top: 12, right: 16, bottom: 28, left: 56 },
} as const;

/**
 * Per-series ink. Eight distinguishable looks out of one hue: the first
 * series is solid and full strength, the rest step down in opacity and pick
 * up a dash pattern, so the chart stays legible in both themes and for
 * anyone who cannot separate the colours.
 */
const SERIES_DASH = ['none', '5 3', '1 3', '7 3 1 3', '3 2', '9 3', '1 2 4 2', '5 2 1 2'];
const SERIES_OPACITY = [1, 0.9, 0.8, 0.72, 0.64, 0.56, 0.48, 0.42];

function seriesStyle(idx: number): { dash: string; opacity: number; width: number } {
  return {
    dash: SERIES_DASH[idx % SERIES_DASH.length],
    opacity: SERIES_OPACITY[Math.min(idx, SERIES_OPACITY.length - 1)],
    width: idx === 0 ? 1.75 : 1.25,
  };
}

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

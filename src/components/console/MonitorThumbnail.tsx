import { clsx } from 'clsx';
import { Video, VideoOff, AlertTriangle, Circle } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import type { Monitor, StreamProtocol } from '@/types';
import { isOrientationRotated } from '@/types';
import { StreamCell } from '@/components/common/StreamCell';

interface MonitorThumbnailProps {
  monitor: Monitor;
  isStreaming?: boolean;
  hasMotion?: boolean;
  hasAlarm?: boolean;
  liveProtocol?: StreamProtocol | null;
  /** Event counts pulled from the parent's useConsoleData so we don't
   *  refetch per card. Undefined = loading; null = data unavailable. */
  counts?: {
    hour: number;
    day: number;
    week: number;
  };
  /** 24-length hourly histogram for this monitor, oldest-first (index 0
   *  = 23h ago, index 23 = current hour). Omitted while still loading. */
  hourly?: number[];
}

/**
 * Approximate row-span for a CSS Grid cell so portrait and landscape
 * cameras pack tightly into the same grid. Computed against fixed
 * COLUMN_WIDTH (matches the grid-template-columns repeat) and ROW_UNIT
 * so the math is exact. The ribbon natural height is small (one name
 * row + one sparkline row + one counter row); 72px covers it.
 */
export const MONITOR_TILE_COLUMN_WIDTH = 280;
export function rowSpanForMonitor(monitor: Monitor): number {
  const ROW_UNIT = 24;
  const RIBBON_HEIGHT = 72;
  const rotated = isOrientationRotated(monitor.orientation);
  const rawW = monitor.width || 16;
  const rawH = monitor.height || 9;
  const aspect = rotated ? rawH / rawW : rawW / rawH;
  const videoHeight = MONITOR_TILE_COLUMN_WIDTH / Math.max(aspect, 0.2);
  const totalHeight = videoHeight + RIBBON_HEIGHT;
  return Math.max(4, Math.ceil(totalHeight / ROW_UNIT));
}

export function MonitorThumbnail({
  monitor,
  isStreaming = false,
  hasMotion = false,
  hasAlarm = false,
  liveProtocol = null,
  counts,
  hourly,
}: MonitorThumbnailProps) {
  const isEnabled = monitor.capturing !== 'None';
  const rotated = isOrientationRotated(monitor.orientation);
  const effW = rotated ? (monitor.height || 9)  : (monitor.width || 16);
  const effH = rotated ? (monitor.width  || 16) : (monitor.height || 9);
  const rowSpan = rowSpanForMonitor(monitor);

  return (
    <Link
      to="/monitors/$monitorId"
      params={{ monitorId: String(monitor.id) }}
      style={{ gridRow: `span ${rowSpan}` }}
      className={clsx(
        'group relative flex flex-col rounded-lg overflow-hidden',
        'bg-abyss border border-border-subtle',
        'transition-all duration-base',
        'hover:border-cyan/50 hover:shadow-lg hover:shadow-cyan/10',
        hasAlarm && 'border-crimson animate-pulse'
      )}
    >
      {/* Video / placeholder area — sized to the camera's true aspect */}
      <div
        className="relative bg-void"
        style={{ aspectRatio: `${effW} / ${effH}` }}
      >
        {isEnabled && liveProtocol ? (
          <>
            <div className="absolute inset-0">
              <StreamCell
                protocol={liveProtocol}
                monitorId={monitor.id}
                orientation={monitor.orientation}
                autoStart
                compact
              />
            </div>

            {(hasMotion || hasAlarm) && (
              <div
                className={clsx(
                  'absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded z-10',
                  hasAlarm ? 'bg-crimson/80' : 'bg-amber/80'
                )}
              >
                <AlertTriangle size={12} className="text-white" />
                <span className="text-xs font-bold text-white">
                  {hasAlarm ? 'ALARM' : 'MOTION'}
                </span>
              </div>
            )}
          </>
        ) : isEnabled ? (
          <>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-text-dim">
                {isStreaming ? (
                  <div className="relative">
                    <Video size={32} className="text-cyan/40" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Circle className="w-2 h-2 fill-crimson text-crimson animate-pulse" />
                    </div>
                  </div>
                ) : (
                  <Video size={32} />
                )}
              </div>
            </div>

            <div className="absolute inset-0 scanlines pointer-events-none" />

            {(hasMotion || hasAlarm) && (
              <div
                className={clsx(
                  'absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded',
                  hasAlarm ? 'bg-crimson/80' : 'bg-amber/80'
                )}
              >
                <AlertTriangle size={12} className="text-white" />
                <span className="text-xs font-bold text-white">
                  {hasAlarm ? 'ALARM' : 'MOTION'}
                </span>
              </div>
            )}

            {isStreaming && (
              <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded bg-black/60">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-crimson opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-crimson" />
                </span>
                <span className="text-xs font-mono font-bold text-white">LIVE</span>
              </div>
            )}
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <VideoOff size={32} className="text-text-dim" />
          </div>
        )}
      </div>

      {/* Activity ribbon — name + 24h sparkline + Hour/Day/Week counters.
          Natural height: stacks vertically without dead space. */}
      <div className="space-y-1 px-2 py-1.5 bg-surface/70 border-t border-border-subtle/60">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={clsx(
              'flex-shrink-0 w-1.5 h-1.5 rounded-full',
              isEnabled ? 'bg-emerald' : 'bg-text-muted',
            )}
            aria-label={isEnabled ? 'Capturing' : 'Idle'}
          />
          <span className="text-[12px] font-medium text-text-primary truncate flex-1">
            {monitor.name}
          </span>
          <span className="text-[9px] font-mono text-text-dim tabular-nums opacity-0 group-hover:opacity-100 transition-opacity">
            {effW}×{effH}
          </span>
        </div>

        <Sparkline hourly={hourly} />
        <ActivityCounters counts={counts} />
      </div>
    </Link>
  );
}

interface ActivityCountersProps {
  counts?: { hour: number; day: number; week: number };
}

function ActivityCounters({ counts }: ActivityCountersProps) {
  // Render even when counts are loading — empty slots reserve the space so
  // the card height doesn't pop in.
  return (
    <div className="flex items-center justify-between text-[10px] font-mono tabular-nums">
      <Counter label="1H"  value={counts?.hour} tone="cyan" />
      <span className="text-text-dim/50">·</span>
      <Counter label="24H" value={counts?.day}  tone="amber" />
      <span className="text-text-dim/50">·</span>
      <Counter label="7D"  value={counts?.week} tone="muted" />
    </div>
  );
}

interface SparklineProps {
  /** 24-length array, index 0 = 23h ago, index 23 = current hour. */
  hourly: number[] | undefined;
}

/**
 * 24-hour event-rate spark over a thin baseline. SVG bars scale to the
 * monitor's own peak so a quiet camera still shows a readable rhythm.
 * When data is loading we render a flat baseline to reserve the row
 * height (keeps tile heights from popping in when buckets arrive).
 */
function Sparkline({ hourly }: SparklineProps) {
  const data = hourly ?? new Array(24).fill(0);
  const peak = Math.max(1, ...data);
  const W = 100;
  const H = 16;
  const BAR_W = W / 24;
  const GAP = BAR_W * 0.18;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="w-full h-4 opacity-90"
      aria-hidden
    >
      {/* baseline */}
      <line
        x1={0}
        x2={W}
        y1={H - 0.5}
        y2={H - 0.5}
        stroke="currentColor"
        strokeWidth={0.5}
        className="text-text-dim/40"
      />
      {data.map((v, i) => {
        const h = peak === 0 ? 0 : (v / peak) * (H - 1);
        const x = (23 - i) * BAR_W + GAP / 2;
        return (
          <rect
            key={i}
            x={x}
            y={H - h}
            width={BAR_W - GAP}
            height={Math.max(0, h)}
            className={
              v === 0
                ? 'fill-text-dim/30'
                : i === 0
                  ? 'fill-cyan'
                  : 'fill-cyan/70'
            }
          />
        );
      })}
    </svg>
  );
}

function Counter({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | undefined;
  tone: 'cyan' | 'amber' | 'muted';
}) {
  const valueCls =
    value == null
      ? 'text-text-dim/40'
      : value === 0
        ? 'text-text-muted/60'
        : tone === 'cyan'
          ? 'text-cyan'
          : tone === 'amber'
            ? 'text-amber'
            : 'text-text-secondary';

  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-text-dim uppercase tracking-wider">{label}</span>
      <span className={clsx('font-medium', valueCls)}>
        {value == null ? '··' : value}
      </span>
    </span>
  );
}

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
}

/**
 * Approximate row-span for a CSS Grid cell so portrait and landscape
 * cameras both pack tightly into the same grid. Calculated from the
 * displayed aspect ratio (orientation-aware) against a fixed 24px row
 * unit and an assumed 240px column width. The activity ribbon adds
 * ~70px of fixed below-video height that's accounted for separately.
 */
export function rowSpanForMonitor(monitor: Monitor): number {
  const ROW_UNIT = 24;
  const COL_WIDTH = 240;
  const RIBBON_HEIGHT = 70;
  const rotated = isOrientationRotated(monitor.orientation);
  const rawW = monitor.width || 16;
  const rawH = monitor.height || 9;
  const aspect = rotated ? rawH / rawW : rawW / rawH;
  const videoHeight = COL_WIDTH / Math.max(aspect, 0.2);
  const totalHeight = videoHeight + RIBBON_HEIGHT;
  return Math.max(4, Math.round(totalHeight / ROW_UNIT));
}

export function MonitorThumbnail({
  monitor,
  isStreaming = false,
  hasMotion = false,
  hasAlarm = false,
  liveProtocol = null,
  counts,
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

      {/* Activity ribbon — sits below the video, fixed height. The name + status
          live here so they don't overlay the picture; counts give a quick read
          of how busy each camera is over Hour / 24h / Week. */}
      <div className="flex-1 flex flex-col justify-between gap-1 px-2 py-1.5 bg-surface/70 border-t border-border-subtle/60">
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

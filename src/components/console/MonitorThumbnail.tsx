import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Video, VideoOff, AlertTriangle, Circle } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import type { Monitor, StreamProtocol } from '@/types';
import { isOrientationRotated } from '@/types';
import { StreamCell } from '@/components/common/StreamCell';
import type { EventSummary } from '@/api/eventSummaries';
import { formatBytes } from '@/lib/format';
import { formatFps, runtimeTone, type MonitorRuntime, type RuntimeTone } from '@/features/monitors/useMonitorStatuses';

/** Lens dot per runtime tone — legacy console colours. */
const LENS: Record<RuntimeTone, string> = {
  ok: 'bg-emerald',
  warn: 'bg-amber',
  down: 'bg-crimson',
  unknown: 'bg-text-muted',
};

interface MonitorThumbnailProps {
  monitor: Monitor;
  isStreaming?: boolean;
  hasMotion?: boolean;
  hasAlarm?: boolean;
  liveProtocol?: StreamProtocol | null;
  /** Per-monitor event summary pulled from the parent's useConsoleData so we
   *  don't refetch per card. Undefined = loading. */
  summary?: EventSummary;
  /** 24-length hourly histogram for this monitor, oldest-first (index 0
   *  = 23h ago, index 23 = current hour). Omitted while still loading. */
  hourly?: number[];
  /** Optional fixed width in pixels — set by a justified-row layout
   *  outside the component. When omitted the tile flows naturally. */
  width?: number;
  /** Capture-process state from `/monitor-status`; drives the lens colour
   *  and the fps readout. Undefined = not polled yet (grey lens). */
  runtime?: MonitorRuntime;
}

export function MonitorThumbnail({
  monitor,
  isStreaming = false,
  hasMotion = false,
  hasAlarm = false,
  liveProtocol = null,
  summary,
  hourly,
  width,
  runtime,
}: MonitorThumbnailProps) {
  const { t, i18n } = useTranslation();
  const isEnabled = monitor.capturing !== 'None';
  // A disabled monitor has no process; anything else reports what zmc is doing.
  const tone: RuntimeTone = isEnabled ? runtimeTone(runtime?.status) : 'unknown';
  const rotated = isOrientationRotated(monitor.orientation);
  const effW = rotated ? (monitor.height || 9)  : (monitor.width || 16);
  const effH = rotated ? (monitor.width  || 16) : (monitor.height || 9);

  return (
    <Link
      to="/monitors/$monitorId"
      params={{ monitorId: String(monitor.id) }}
      style={width != null ? { width: `${width}px` } : undefined}
      className={clsx(
        'group relative flex flex-col rounded-lg overflow-hidden self-start',
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
                rotationFit="fill"
              />
            </div>

            {(hasMotion || hasAlarm) && (
              <div
                className={clsx(
                  'absolute top-2 end-2 flex items-center gap-1 px-2 py-1 rounded z-10',
                  hasAlarm ? 'bg-crimson/80' : 'bg-amber/80'
                )}
              >
                <AlertTriangle size={12} className="text-white" />
                <span className="text-xs font-bold text-white">
                  {hasAlarm ? t('ALARM') : t('MOTION')}
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
                  'absolute top-2 end-2 flex items-center gap-1 px-2 py-1 rounded',
                  hasAlarm ? 'bg-crimson/80' : 'bg-amber/80'
                )}
              >
                <AlertTriangle size={12} className="text-white" />
                <span className="text-xs font-bold text-white">
                  {hasAlarm ? t('ALARM') : t('MOTION')}
                </span>
              </div>
            )}

            {isStreaming && (
              <div className="absolute top-2 start-2 flex items-center gap-1.5 px-2 py-1 rounded bg-black/60">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-crimson opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-crimson" />
                </span>
                <span className="text-xs font-mono font-bold text-white">{t('LIVE')}</span>
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
            className={clsx('flex-shrink-0 w-1.5 h-1.5 rounded-full', LENS[tone])}
            aria-label={isEnabled ? (runtime?.status ?? t('Capturing')) : t('Idle')}
            title={isEnabled ? runtime?.status : undefined}
          />
          <span className="text-[12px] font-medium text-text-primary truncate flex-1">
            {monitor.name}
          </span>
          {isEnabled && runtime && (
            <span
              className={clsx('text-[9px] font-mono tabular-nums', tone === 'ok' ? 'text-text-muted' : 'text-amber')}
              data-testid="thumb-fps"
            >
              {formatFps(runtime.captureFps, i18n.language)}
            </span>
          )}
          <span className="text-[9px] font-mono text-text-dim tabular-nums opacity-0 group-hover:opacity-100 transition-opacity">
            {effW}×{effH}
          </span>
        </div>

        <Sparkline hourly={hourly} />
        <ActivityCounters summary={summary} />
      </div>
    </Link>
  );
}

interface ActivityCountersProps {
  summary?: EventSummary;
}

function ActivityCounters({ summary }: ActivityCountersProps) {
  const { t } = useTranslation();
  // Render even when summary is loading — empty slots reserve the space so
  // the card height doesn't pop in. Disk space appears as a tooltip on
  // hover so we don't blow the tile height.
  return (
    <div className="flex items-center justify-between text-[10px] font-mono tabular-nums">
      <Counter
        label={t('1H')}
        value={summary?.hour_events}
        title={summary && summary.hour_event_disk_space > 0
          ? t('{{size}} in last hour', { size: formatBytes(summary.hour_event_disk_space) }) : undefined}
        tone="cyan"
      />
      <span className="text-text-dim/50">·</span>
      <Counter
        label={t('24H')}
        value={summary?.day_events}
        title={summary && summary.day_event_disk_space > 0
          ? t('{{size}} today', { size: formatBytes(summary.day_event_disk_space) }) : undefined}
        tone="amber"
      />
      <span className="text-text-dim/50">·</span>
      <Counter
        label={t('7D')}
        value={summary?.week_events}
        title={summary && summary.week_event_disk_space > 0
          ? t('{{size}} this week', { size: formatBytes(summary.week_event_disk_space) }) : undefined}
        tone="muted"
      />
    </div>
  );
}

interface SparklineProps {
  /** 24-length array, index 0 = current hour (newest), index 23 = ~24h ago.
   *  Undefined while loading. */
  hourly: number[] | undefined;
}

/**
 * 24-hour event-rate spark. Each bar's opacity decays linearly from
 * newest (right, full cyan) to oldest (left, ~20%) — one visual rule
 * encodes both intensity and time direction, replacing the previous
 * three-state colour split. Zero-event hours render as absent rather
 * than as dim ghost bars, so the baseline reads cleanly.
 *
 *  - NOW dot at the right edge anchors the time direction without
 *    needing a label (right = recent, left = 24h ago)
 *  - native <title> on each bar gives hover detail like '5h ago · 4
 *    events' with zero JS
 *  - loading state is an animated shimmer, distinct from 'all zeros'
 *  - 'all zeros' renders as a flat baseline with a small 'quiet'
 *    caption rather than 24 ghost bars
 *
 * Per-monitor peak normalisation is intentional: the spark answers
 * 'when was this camera active?' (rhythm). For volume, read the
 * 1H/24H/7D counters below — they carry the absolute numbers.
 */
function Sparkline({ hourly }: SparklineProps) {
  const { t } = useTranslation();
  // Distinct loading + empty states.
  if (hourly == null) {
    return (
      <div className="h-4 rounded-sm bg-surface/60 animate-pulse" aria-label={t('Loading activity')} />
    );
  }

  const peak = Math.max(0, ...hourly);
  if (peak === 0) {
    return (
      <div className="h-4 flex items-center text-[9px] font-mono text-text-dim italic">
        <span className="flex-1 border-t border-text-dim/20" aria-hidden />
        <span className="px-2">{t('quiet · 24h')}</span>
        <span className="flex-1 border-t border-text-dim/20" aria-hidden />
      </div>
    );
  }

  // Bars in pixel space — no viewBox stretching. Oldest on the left,
  // newest on the right; source array is newest-first so we iterate in
  // reverse to render.
  // dir="ltr": a timeline is physical media — oldest stays on the left in
  // RTL locales too.
  return (
    <div
      dir="ltr"
      className="flex items-end gap-[1px] h-4"
      role="img"
      aria-label={t('24-hour event activity, peak {{count}} events per hour', { count: peak })}
    >
      {[...hourly].reverse().map((v, idx) => {
        const hoursAgo = 23 - idx;
        const heightPct = (v / peak) * 100;
        // Opacity ramp: newest = 1.0, oldest = 0.2. One rule encodes
        // intensity AND time direction.
        const opacity = 0.2 + (idx / 23) * 0.8;
        return (
          <div key={hoursAgo} className="flex-1 h-full relative">
            {v > 0 && (
              <div
                className="absolute bottom-0 start-0 end-0 rounded-t-[1px] bg-cyan"
                style={{
                  height: `${Math.max(heightPct, 6)}%`,
                  opacity,
                }}
              >
                <title>
                  {hoursAgo === 0
                    ? t('last hour · {{count}} event', { count: v })
                    : t('{{hours}}h ago · {{count}} event', { hours: hoursAgo, count: v })}
                </title>
              </div>
            )}
          </div>
        );
      })}
      {/* NOW dot — anchors the right edge as 'most recent' so operators
          read the direction correctly without a label. */}
      <span
        aria-hidden
        title={t('now')}
        className="ms-0.5 w-1 h-1 rounded-full bg-cyan self-end shadow-[0_0_4px_var(--color-cyan)]"
      />
    </div>
  );
}

function Counter({
  label,
  value,
  tone,
  title,
}: {
  label: string;
  value: number | undefined;
  tone: 'cyan' | 'amber' | 'muted';
  title?: string;
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
    <span className="inline-flex items-center gap-1" title={title}>
      <span className="text-text-dim uppercase tracking-wider">{label}</span>
      <span className={clsx('font-medium', valueCls)}>
        {value == null ? '··' : value}
      </span>
    </span>
  );
}

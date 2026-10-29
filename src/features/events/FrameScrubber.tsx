import { useQuery } from '@tanstack/react-query';
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Zap } from 'lucide-react';
import { getAllFramesForEvent, type Frame } from '@/api/frames';
import { isAlarmFrame, SCRUBBER_LABEL_COUNT } from './alarmCues';
import { levelGraphBands, levelGraphPoints, levelGraphScoreAt, levelGraphSeries } from './levelGraph';

/** The graph's own coordinate box; the SVG stretches it over the track. */
const GRAPH_W = 1000;
const GRAPH_H = 48;

interface FrameScrubberProps {
  eventId: number;
  /** Wall-clock duration of the event in seconds — needed to position frames. */
  durationSec: number;
  /** Current playhead in seconds (from the <video>). */
  currentTimeSec: number;
  /** Seek the video to a frame's delta offset. */
  onSeek: (timeSec: number) => void;
  /**
   * When the recording started. With it the track gets legacy's ten
   * wall-clock labels and the hover indicator reads a time of day rather
   * than an offset.
   */
  startTime?: Date | null;
}

/**
 * Per-frame scrubber backed by `/api/v3/frames?event_id=…`, after legacy's
 * `#progressBar`: ten wall-clock labels across the track, the 1.39.41 level
 * graph (each frame's motion score as a line, alarm periods shaded behind
 * it), and a hover indicator reading the time of day and the score under
 * the pointer.
 *
 * Three ways to navigate: click anywhere on the track to jump there, drag to
 * scrub, or use the prev / next-frame buttons for single-step inspection.
 */
export function FrameScrubber({
  eventId,
  durationSec,
  currentTimeSec,
  onSeek,
  startTime,
}: FrameScrubberProps) {
  const { t } = useTranslation();
  const trackRef = useRef<HTMLDivElement | null>(null);
  /** Seconds under the pointer, or null when it is not over the track. */
  const [hoverSec, setHoverSec] = useState<number | null>(null);

  const { data: frames = [], isLoading } = useQuery({
    queryKey: ['eventFrames', eventId],
    queryFn: () => getAllFramesForEvent(eventId),
  });

  // Frames sorted by frame_id (defensive — the API usually returns them sorted).
  const sortedFrames = useMemo(
    () => [...frames].sort((a, b) => a.frame_id - b.frame_id),
    [frames],
  );

  // Legacy's `event_length`: the event's own length, unless the last frame's
  // delta runs past it (an event still being recorded).
  const lastDelta = sortedFrames.length
    ? parseFloat(sortedFrames[sortedFrames.length - 1].delta)
    : 0;
  const trackLength = Math.max(durationSec, Number.isFinite(lastDelta) ? lastDelta : 0, 0.001);

  const series = useMemo(() => levelGraphSeries(sortedFrames, trackLength), [sortedFrames, trackLength]);
  const bands = useMemo(() => levelGraphBands(series.samples, trackLength), [series, trackLength]);

  // Find the frame whose delta is closest to the current playhead.
  const activeIndex = useMemo(() => {
    if (sortedFrames.length === 0) return -1;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < sortedFrames.length; i++) {
      const d = Math.abs(parseFloat(sortedFrames[i].delta) - currentTimeSec);
      if (d < bestDist) {
        best = i;
        bestDist = d;
      }
    }
    return best;
  }, [sortedFrames, currentTimeSec]);

  const seekToFrameIndex = (i: number) => {
    const f = sortedFrames[i];
    if (!f) return;
    const t = parseFloat(f.delta);
    if (!isNaN(t)) onSeek(t);
  };

  const secondsFromPointer = (e: ReactPointerEvent<HTMLDivElement>): number | null => {
    const el = trackRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    return pct * trackLength;
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const at = secondsFromPointer(e);
    if (at != null) onSeek(at);
  };
  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const at = secondsFromPointer(e);
    if (at == null) return;
    setHoverSec(at);
    if (e.buttons === 1) onSeek(at);
  };

  const playheadPct = Math.max(0, Math.min(100, (currentTimeSec / trackLength) * 100));
  const activeFrame = sortedFrames[activeIndex];

  /** A time of day `n` seconds into the recording, for labels and hover. */
  const clockAt = (seconds: number): string | null =>
    startTime ? new Date(startTime.getTime() + seconds * 1000).toLocaleTimeString() : null;

  const hoverScore = hoverSec == null ? null : levelGraphScoreAt(series, hoverSec);
  const hoverPct = hoverSec == null ? 0 : Math.max(0, Math.min(100, (hoverSec / trackLength) * 100));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-label text-fg-dim">
          {t('Frame scrubber')}
        </span>
        <div className="flex items-center gap-2">
          {activeFrame && (
            <FrameReadout frame={activeFrame} totalFrames={sortedFrames.length} />
          )}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => seekToFrameIndex(Math.max(0, activeIndex - 1))}
              disabled={activeIndex <= 0}
              aria-label={t('Previous frame')}
              className="p-1 rounded border border-border-subtle bg-surface text-fg-dim hover:text-fg hover:border-border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={12} />
            </button>
            <button
              onClick={() => seekToFrameIndex(Math.min(sortedFrames.length - 1, activeIndex + 1))}
              disabled={activeIndex < 0 || activeIndex >= sortedFrames.length - 1}
              aria-label={t('Next frame')}
              className="p-1 rounded border border-border-subtle bg-surface text-fg-dim hover:text-fg hover:border-border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight size={12} />
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="h-8 rounded border border-border-subtle bg-bg-sunken" />
      ) : sortedFrames.length === 0 ? (
        <div className="h-8 rounded border border-border-subtle bg-bg-sunken flex items-center justify-center">
          <span className="text-xs text-fg-dim">{t('No frame data')}</span>
        </div>
      ) : (
        <div className="space-y-1">
          <div
            ref={trackRef}
            dir="ltr"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerLeave={() => setHoverSec(null)}
            className="relative h-12 rounded border border-border-subtle bg-bg-sunken overflow-hidden cursor-crosshair select-none"
            style={{ touchAction: 'none' }}
          >
            {/* Legacy's level graph (1.39.41 `LevelGraph.js`): alarm
                periods as a pale wash, the motion score as a line scaled
                to this event's own peak. */}
            <svg
              data-testid="level-graph"
              viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`}
              preserveAspectRatio="none"
              aria-hidden
              className="absolute inset-0 w-full h-full pointer-events-none"
            >
              {bands.map((b) => (
                <rect
                  key={b.start}
                  data-testid="level-graph-band"
                  x={(b.start / trackLength) * GRAPH_W}
                  y={0}
                  width={Math.max(1, ((b.end - b.start) / trackLength) * GRAPH_W)}
                  height={GRAPH_H}
                  fill="var(--warn)"
                  fillOpacity={0.25}
                />
              ))}
              {series.hasScores && (
                <polyline
                  data-testid="level-graph-motion"
                  points={levelGraphPoints(series.samples, trackLength, series.motionMax, GRAPH_W, GRAPH_H)}
                  fill="none"
                  stroke="var(--fg-muted)"
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </svg>

            {/* The active frame: where the step buttons sit. */}
            {activeFrame && (
              <FrameTick
                frame={activeFrame}
                leftPct={(parseFloat(activeFrame.delta) / trackLength) * 100}
              />
            )}

            {/* Hover indicator — legacy's `#indicator`, labelled with the
                wall-clock time under the pointer. */}
            {hoverSec != null && (
              <div
                data-testid="scrubber-indicator"
                className="absolute top-0 bottom-0 w-px bg-accent/70 pointer-events-none"
                style={{ left: `${hoverPct}%` }}
                title={clockAt(hoverSec) ?? `${hoverSec.toFixed(1)}s`}
              >
                <span className="absolute top-0 start-1 whitespace-nowrap text-xs font-mono tabular-nums text-fg bg-surface/80 px-0.5">
                  {clockAt(hoverSec) ?? t('{{seconds}}s', { seconds: Math.round(hoverSec) })}
                  {hoverScore != null && <> &mdash; {t('motion {{score}}', { score: hoverScore })}</>}
                </span>
              </div>
            )}

            {/* Playhead — overlays the ticks */}
            <div
              className="absolute top-0 bottom-0 pointer-events-none"
              style={{ left: `${playheadPct}%` }}
            >
              <div className="w-px h-full bg-accent" />
            </div>
          </div>

          {/* Ten wall-clock labels, one per tenth of the recording. */}
          {startTime && (
            <div
              dir="ltr"
              data-testid="scrubber-time-labels"
              className="grid gap-px text-xs font-mono tabular-nums text-fg-dim"
              style={{ gridTemplateColumns: `repeat(${SCRUBBER_LABEL_COUNT}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: SCRUBBER_LABEL_COUNT }, (_, i) => (
                <span key={i} className="truncate">
                  {clockAt((i * trackLength) / SCRUBBER_LABEL_COUNT)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The playhead's frame, as a mark on the graph. */
function FrameTick({ frame, leftPct }: { frame: Frame; leftPct: number }) {
  return (
    <div
      data-testid="active-frame-tick"
      data-frame-id={frame.frame_id}
      className="absolute top-0 bottom-0 w-px pointer-events-none bg-fg"
      style={{ left: `${Math.max(0, Math.min(100, leftPct))}%` }}
    />
  );
}

function FrameReadout({
  frame,
  totalFrames,
}: {
  frame: Frame;
  totalFrames: number;
}) {
  const { t } = useTranslation();
  const isAlarm = isAlarmFrame(frame);
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 text-xs font-mono tabular-nums',
      isAlarm ? 'text-warn' : 'text-fg-muted',
    )}>
      {isAlarm && <Zap size={10} aria-hidden />}
      #{frame.frame_id} / {totalFrames}
      <span className="text-fg-faint">·</span>
      <span>{t('score {{score}}', { score: frame.score })}</span>
    </span>
  );
}

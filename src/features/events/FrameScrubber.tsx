import { useQuery } from '@tanstack/react-query';
import { useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Zap } from 'lucide-react';
import { getAllFramesForEvent, type Frame } from '@/api/frames';

interface FrameScrubberProps {
  eventId: number;
  /** Wall-clock duration of the event in seconds — needed to position frames. */
  durationSec: number;
  /** Current playhead in seconds (from the <video>). */
  currentTimeSec: number;
  /** Seek the video to a frame's delta offset. */
  onSeek: (timeSec: number) => void;
}

/**
 * Per-frame scrubber backed by `/api/v3/frames?event_id=…`. Each frame becomes
 * a thin tick on a horizontal track: normal frames are drawn in a neutral
 * foreground, alarm frames in the warn colour because that is a state, and
 * both are opacity-scaled by score so a high-motion stretch reads at a
 * glance.
 *
 * Three ways to navigate: click anywhere on the track to jump to the nearest
 * frame, drag the playhead to scrub, or use the prev / next-frame buttons for
 * single-step inspection.
 */
export function FrameScrubber({
  eventId,
  durationSec,
  currentTimeSec,
  onSeek,
}: FrameScrubberProps) {
  const { t } = useTranslation();
  const trackRef = useRef<HTMLDivElement | null>(null);

  const { data: frames = [], isLoading } = useQuery({
    queryKey: ['eventFrames', eventId],
    queryFn: () => getAllFramesForEvent(eventId),
  });

  // Frames sorted by frame_id (defensive — the API usually returns them sorted).
  const sortedFrames = useMemo(
    () => [...frames].sort((a, b) => a.frame_id - b.frame_id),
    [frames],
  );

  // Highest score across the event for colour normalisation.
  const maxScore = useMemo(
    () => sortedFrames.reduce((m, f) => Math.max(m, f.score), 0),
    [sortedFrames],
  );

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

  const seekFromPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = trackRef.current;
    if (!el || durationSec <= 0) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    onSeek(pct * durationSec);
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    seekFromPointer(e);
  };
  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.buttons !== 1) return;
    seekFromPointer(e);
  };

  const playheadPct = durationSec > 0
    ? Math.max(0, Math.min(100, (currentTimeSec / durationSec) * 100))
    : 0;

  const activeFrame = sortedFrames[activeIndex];

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
        <div
          ref={trackRef}
          dir="ltr"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          className="relative h-8 rounded border border-border-subtle bg-bg-sunken overflow-hidden cursor-crosshair select-none"
          style={{ touchAction: 'none' }}
        >
          {/* Frame ticks */}
          {sortedFrames.map((f, i) => (
            <FrameTick
              key={f.id}
              frame={f}
              maxScore={maxScore}
              isActive={i === activeIndex}
              leftPct={(parseFloat(f.delta) / Math.max(durationSec, 0.001)) * 100}
            />
          ))}

          {/* Playhead — overlays the ticks */}
          <div
            className="absolute top-0 bottom-0 pointer-events-none"
            style={{ left: `${playheadPct}%` }}
          >
            <div className="w-px h-full bg-accent" />
          </div>
        </div>
      )}
    </div>
  );
}

interface FrameTickProps {
  frame: Frame;
  maxScore: number;
  isActive: boolean;
  leftPct: number;
}

function FrameTick({ frame, maxScore, isActive, leftPct }: FrameTickProps) {
  const isAlarm = frame.type === 'Alarm' || frame.type === 'Bulk';
  // Intensity 0..1 by score / maxScore — high-motion stretches read through
  // opacity rather than a second hue, so the only colour on the track is the
  // one that means "alarm".
  const intensity = maxScore > 0 ? Math.min(1, frame.score / maxScore) : 0;

  return (
    <div
      className="absolute top-0 bottom-0 w-px pointer-events-none"
      style={{
        left: `${Math.max(0, Math.min(100, leftPct))}%`,
        background: isActive
          ? 'var(--fg)'
          : isAlarm
            ? 'var(--warn)'
            : 'var(--fg-dim)',
        opacity: isActive
          ? 1
          : isAlarm
            ? 0.45 + 0.55 * intensity
            : 0.25 + 0.4 * intensity,
      }}
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
  const isAlarm = frame.type === 'Alarm' || frame.type === 'Bulk';
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

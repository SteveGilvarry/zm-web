import { useQuery } from '@tanstack/react-query';
import { useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { clsx } from 'clsx';
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
 * a thin tick on a horizontal track, coloured by type (alarm vs normal) and
 * intensity-scaled by score so a high-motion stretch is visible at a glance.
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
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">
          Frame Scrubber
        </span>
        <div className="flex items-center gap-2">
          {activeFrame && (
            <FrameReadout frame={activeFrame} totalFrames={sortedFrames.length} />
          )}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => seekToFrameIndex(Math.max(0, activeIndex - 1))}
              disabled={activeIndex <= 0}
              aria-label="Previous frame"
              className="p-1 rounded border border-border-subtle bg-surface text-text-muted hover:border-cyan/40 hover:text-cyan transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={12} />
            </button>
            <button
              onClick={() => seekToFrameIndex(Math.min(sortedFrames.length - 1, activeIndex + 1))}
              disabled={activeIndex < 0 || activeIndex >= sortedFrames.length - 1}
              aria-label="Next frame"
              className="p-1 rounded border border-border-subtle bg-surface text-text-muted hover:border-cyan/40 hover:text-cyan transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight size={12} />
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="h-8 rounded bg-surface animate-pulse" />
      ) : sortedFrames.length === 0 ? (
        <div className="h-8 rounded border border-border-subtle bg-surface/50 flex items-center justify-center">
          <span className="text-[10px] text-text-muted italic">No frame data</span>
        </div>
      ) : (
        <div
          ref={trackRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          className="relative h-8 rounded border border-border-subtle bg-abyss overflow-hidden cursor-crosshair select-none"
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
            <div className="w-px h-full bg-cyan shadow-[0_0_6px_rgba(0,212,255,0.7)]" />
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
  // Intensity 0..1 by score / maxScore — gives high-motion stretches a clear
  // visual signature without overwhelming low-score frames.
  const intensity = maxScore > 0 ? Math.min(1, frame.score / maxScore) : 0;

  return (
    <div
      className="absolute top-0 bottom-0 w-px pointer-events-none"
      style={{
        left: `${Math.max(0, Math.min(100, leftPct))}%`,
        background: isAlarm
          ? `rgba(255,170,0,${0.4 + 0.6 * intensity})`
          : `rgba(0,212,255,${0.2 + 0.4 * intensity})`,
        boxShadow: isActive ? '0 0 4px rgba(255,255,255,0.8)' : undefined,
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
  const isAlarm = frame.type === 'Alarm' || frame.type === 'Bulk';
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 text-[10px] font-mono tabular-nums',
      isAlarm ? 'text-amber' : 'text-text-secondary',
    )}>
      {isAlarm && <Zap size={10} />}
      #{frame.frame_id} / {totalFrames}
      <span className="text-text-dim">·</span>
      <span>score {frame.score}</span>
    </span>
  );
}

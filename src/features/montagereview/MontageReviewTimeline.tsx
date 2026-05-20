import { useRef, useMemo, type PointerEvent as ReactPointerEvent } from 'react';
import { clsx } from 'clsx';
import { useReviewEvents } from './useReviewEvents';
import type { Monitor, ZmEvent } from '@/types';

interface MontageReviewTimelineProps {
  monitors: Monitor[];
  rangeStart: Date;
  rangeEnd: Date;
  currentTime: Date;
  onSeek: (t: Date) => void;
}

/**
 * Horizontal timeline showing each selected monitor as a track. Recorded
 * events appear as cyan bars; a draggable vertical playhead spans all tracks.
 * Click anywhere on a track to jump the playhead to that moment; drag the
 * playhead to scrub through the range.
 */
export function MontageReviewTimeline({
  monitors,
  rangeStart,
  rangeEnd,
  currentTime,
  onSeek,
}: MontageReviewTimelineProps) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const durationMs = rangeEnd.getTime() - rangeStart.getTime();

  const playheadPct = useMemo(() => {
    if (durationMs <= 0) return 0;
    const pct = ((currentTime.getTime() - rangeStart.getTime()) / durationMs) * 100;
    return Math.max(0, Math.min(100, pct));
  }, [currentTime, rangeStart, durationMs]);

  const seekFromPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = bodyRef.current;
    if (!el || durationMs <= 0) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    onSeek(new Date(rangeStart.getTime() + pct * durationMs));
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    seekFromPointer(e);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.buttons !== 1) return; // only while held
    seekFromPointer(e);
  };

  // Evenly spaced tick labels across the range.
  const ticks = useMemo(() => {
    const count = 5;
    return Array.from({ length: count }, (_, i) => {
      const pct = (i / (count - 1)) * 100;
      const t = new Date(rangeStart.getTime() + (durationMs * i) / (count - 1));
      return { pct, t };
    });
  }, [rangeStart, durationMs]);

  return (
    <div className="bg-surface rounded-xl border border-border-subtle overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle">
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">
          Timeline
        </span>
        <span className="text-xs font-mono tabular-nums text-cyan">
          {currentTime.toLocaleTimeString([], { hour12: false })}
        </span>
      </div>

      {/* Tick labels */}
      <div className="relative h-5 px-3 border-b border-border-subtle/50">
        {ticks.map((tick, i) => (
          <span
            key={i}
            className="absolute top-1 text-[9px] font-mono text-text-dim tabular-nums -translate-x-1/2"
            style={{ left: `${tick.pct}%` }}
          >
            {formatTick(tick.t, durationMs)}
          </span>
        ))}
      </div>

      {/* Tracks + playhead */}
      <div
        ref={bodyRef}
        className="relative cursor-crosshair"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        style={{ touchAction: 'none' }}
      >
        {monitors.map((monitor) => (
          <Track
            key={monitor.id}
            monitor={monitor}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
          />
        ))}

        {/* Playhead — spans every track */}
        <div
          className="absolute top-0 bottom-0 pointer-events-none"
          style={{ left: `${playheadPct}%` }}
        >
          <div className="w-px h-full bg-cyan shadow-[0_0_6px_rgba(0,212,255,0.6)]" />
          <div className="absolute -top-1 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-cyan shadow-[0_0_8px_rgba(0,212,255,0.8)]" />
        </div>
      </div>
    </div>
  );
}

interface TrackProps {
  monitor: Monitor;
  rangeStart: Date;
  rangeEnd: Date;
}

function Track({ monitor, rangeStart, rangeEnd }: TrackProps) {
  const { events } = useReviewEvents(monitor.id, rangeStart, rangeEnd);
  const durationMs = rangeEnd.getTime() - rangeStart.getTime();

  return (
    <div className="relative h-8 flex items-center border-b border-border-subtle/30 last:border-b-0">
      <div className="absolute left-0 top-0 bottom-0 w-32 px-3 flex items-center bg-surface/80 backdrop-blur-sm border-r border-border-subtle z-10">
        <span className="text-[11px] text-text-secondary truncate font-medium">
          {monitor.name}
        </span>
      </div>
      <div className="absolute left-32 right-0 top-0 bottom-0">
        {events.map((event) => (
          <EventBar
            key={event.id}
            event={event}
            rangeStart={rangeStart}
            durationMs={durationMs}
          />
        ))}
      </div>
    </div>
  );
}

interface EventBarProps {
  event: ZmEvent;
  rangeStart: Date;
  durationMs: number;
}

function EventBar({ event, rangeStart, durationMs }: EventBarProps) {
  if (!event.start_date_time || durationMs <= 0) return null;
  const start = Date.parse(event.start_date_time);
  if (isNaN(start)) return null;
  const end = event.end_date_time ? Date.parse(event.end_date_time) : start + 60_000;
  const leftPct = ((start - rangeStart.getTime()) / durationMs) * 100;
  const widthPct = Math.max(0.2, ((end - start) / durationMs) * 100);

  // Out of range
  if (leftPct + widthPct < 0 || leftPct > 100) return null;

  const highScore = (event.max_score ?? 0) > 50;
  return (
    <div
      className={clsx(
        'absolute top-1/2 -translate-y-1/2 h-3 rounded-sm pointer-events-none',
        highScore
          ? 'bg-amber/50 border border-amber/80'
          : 'bg-cyan/30 border border-cyan/60',
      )}
      style={{
        left: `${Math.max(0, leftPct)}%`,
        width: `${Math.min(100 - Math.max(0, leftPct), widthPct)}%`,
      }}
      title={`${event.name} — ${event.start_date_time}`}
    />
  );
}

function formatTick(t: Date, durationMs: number): string {
  // Short tick label — show only the most precise field that varies.
  const hours = durationMs / (1000 * 60 * 60);
  if (hours <= 2) {
    return t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  if (hours <= 48) {
    return t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return t.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

import { useRef, useMemo, type PointerEvent as ReactPointerEvent } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { eventEndMs, useReviewEvents } from './useReviewEvents';
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
 * events appear as accent bars; a draggable vertical playhead spans all tracks.
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
  const { t } = useTranslation();
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
    <div dir="ltr" className="bg-surface rounded border border-border-subtle overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border-subtle">
        <span className="text-label text-fg-dim">
          {t('Timeline')}
        </span>
        <span className="text-xs font-mono tabular-nums text-fg">
          {currentTime.toLocaleTimeString([], { hour12: false })}
        </span>
      </div>

      {/* Tick labels */}
      <div className="relative h-5 px-3 border-b border-border-subtle/50">
        {ticks.map((tick, i) => (
          <span
            key={i}
            className="absolute top-1 text-xs font-mono text-fg-faint tabular-nums -translate-x-1/2"
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
          <div className="w-px h-full bg-accent" />
          <div className="absolute -top-1 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-accent" />
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
      <div className="absolute start-0 top-0 bottom-0 w-32 px-3 flex items-center bg-surface border-e border-border-subtle z-10">
        <span className="text-xs text-fg-muted truncate font-medium">
          {monitor.name}
        </span>
      </div>
      <div className="absolute start-32 end-0 top-0 bottom-0">
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
  // Same rule as the cell lookup: an in-progress event runs up to now.
  const end = eventEndMs(event) ?? start;
  const leftPct = ((start - rangeStart.getTime()) / durationMs) * 100;
  const widthPct = Math.max(0.2, ((end - start) / durationMs) * 100);

  // Out of range
  if (leftPct + widthPct < 0 || leftPct > 100) return null;

  const highScore = (event.max_score ?? 0) > 50;
  return (
    <div
      className={clsx(
        'absolute top-1/2 -translate-y-1/2 h-3 rounded pointer-events-none',
        // Only a high-scoring event earns colour; ordinary footage is grey so
        // the eye lands on the one bar that matters (docs/DESIGN.md).
        highScore
          ? 'bg-motion/50 border border-motion/80'
          : 'bg-fg-dim/40 border border-fg-dim/60',
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

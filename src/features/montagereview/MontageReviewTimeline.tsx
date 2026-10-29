import { useRef, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { eventEndMs, useReviewEvents, DEFAULT_REVIEW_FILTERS, type ReviewEventFilters } from './useReviewEvents';
import { frameAlpha, useFrameScores } from './useFrameScores';
import type { Monitor, ZmEvent } from '@/types';

interface MontageReviewTimelineProps {
  monitors: Monitor[];
  rangeStart: Date;
  rangeEnd: Date;
  currentTime: Date;
  onSeek: (t: Date) => void;
  /** Archived / Tags / Notes filters from the toolbar. */
  filters?: ReviewEventFilters;
  /**
   * Offer the collapse chevron in the header (default). The classic page
   * turns it off: legacy's `#collapse` sits in the button row instead.
   */
  collapsible?: boolean;
  /**
   * `classic` draws legacy's `#timeline` canvas: a bordered strip on the
   * dark panel with no header, the names in white over the bars, 20 px
   * rows, and the window's edges written along the bottom. `modern`
   * (default) is the card with the Timeline header.
   */
  variant?: 'modern' | 'classic';
}

/**
 * Width of the monitor-name column on the start side of every track. The
 * bars, the playhead, its time label and the pointer seek all live in the
 * region after it, so one instant maps to one x everywhere.
 */
const NAME_COLUMN = 'start-32';
/** Legacy writes the names over the bars, so its axis starts at the edge. */
const CLASSIC_NAME_COLUMN = 'start-0';

/** Legacy's fallback when a monitor has no `WebColour` (`drawEventOnGraph`). */
export const DEFAULT_MONITOR_COLOUR = '#43bcf2';

function monitorColour(monitor: Pick<Monitor, 'web_colour'>): string {
  const colour = monitor.web_colour?.trim();
  return colour ? colour : DEFAULT_MONITOR_COLOUR;
}

/**
 * Horizontal timeline showing each selected monitor as a track. Recorded
 * events appear as bars in the monitor's own `web_colour`, shaded per alarm
 * frame by score (legacy `drawEventOnGraph` / `drawFrameOnGraph`); a
 * draggable vertical playhead spans all tracks, with the window's start and
 * end written at the edges and the playhead time above it. Click anywhere on
 * a track to jump the playhead to that moment; drag it to scrub. The header
 * collapses the whole thing (legacy `#collapse`).
 */
export function MontageReviewTimeline({
  monitors,
  rangeStart,
  rangeEnd,
  currentTime,
  onSeek,
  filters = DEFAULT_REVIEW_FILTERS,
  collapsible = true,
  variant = 'modern',
}: MontageReviewTimelineProps) {
  const { t } = useTranslation();
  const classic = variant === 'classic';
  const nameColumn = classic ? CLASSIC_NAME_COLUMN : NAME_COLUMN;
  // The time axis: the body minus the name column, the same box the bars
  // are laid out in. Seeking measures this, never the whole body.
  const laneRef = useRef<HTMLDivElement | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const durationMs = rangeEnd.getTime() - rangeStart.getTime();

  const playheadPct = useMemo(() => {
    if (durationMs <= 0) return 0;
    const pct = ((currentTime.getTime() - rangeStart.getTime()) / durationMs) * 100;
    return Math.max(0, Math.min(100, pct));
  }, [currentTime, rangeStart, durationMs]);

  const seekFromPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = laneRef.current;
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

  // Legacy `drawGraph` drops `scrubleft` / `scrubright` while the slider's
  // own label would sit on top of them.
  const EDGE_CLEARANCE_PCT = 8;
  // Centred on the playhead, except at the edges where it would leave the
  // box: there it hangs off the playhead's inner side.
  const playheadLabelShift = playheadPct <= EDGE_CLEARANCE_PCT
    ? 'translate-x-0'
    : playheadPct >= 100 - EDGE_CLEARANCE_PCT ? '-translate-x-full' : '-translate-x-1/2';
  const labelLane = (
    <div className={classic ? 'relative h-4' : 'relative h-5 border-b border-border-subtle/50'}>
      <div className={`absolute ${nameColumn} end-0 top-0 bottom-0`} data-testid="review-timeline-label-lane">
        {playheadPct > EDGE_CLEARANCE_PCT && (
        <span
          className={`absolute start-1 top-0.5 text-xs tabular-nums ${classic ? 'text-white' : 'font-mono text-fg-faint'}`}
          data-testid="review-timeline-min"
        >
          {formatEdge(rangeStart, durationMs)}
        </span>
        )}
        {playheadPct < 100 - EDGE_CLEARANCE_PCT && (
        <span
          className={`absolute end-3 top-0.5 text-xs tabular-nums ${classic ? 'text-white' : 'font-mono text-fg-faint'}`}
          data-testid="review-timeline-max"
        >
          {formatEdge(rangeEnd, durationMs)}
        </span>
        )}
        <span
          className={`absolute top-0.5 text-xs tabular-nums ${playheadLabelShift} ${classic ? 'text-white font-semibold' : 'font-mono text-fg'}`}
          style={{ left: `${playheadPct}%` }}
          data-testid="review-timeline-playhead-label"
        >
          {formatEdge(currentTime, durationMs)}
        </span>
      </div>
    </div>
  );

  return (
    <div
      dir="ltr"
      data-testid="review-timeline"
      className={classic ? 'border border-white overflow-hidden' : 'bg-surface rounded border border-border-subtle overflow-hidden'}
    >
      {!classic && (
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border-subtle">
        <span className="text-label text-fg-dim">
          {t('Timeline')}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono tabular-nums text-fg" data-testid="review-timeline-current">
            {currentTime.toLocaleTimeString([], { hour12: false })}
          </span>
          {collapsible && (
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              aria-expanded={!collapsed}
              aria-label={t('Toggle timeline visibility')}
              title={t('Toggle timeline visibility')}
              className="text-fg-dim hover:text-fg"
            >
              {collapsed ? <ChevronDown size={14} aria-hidden /> : <ChevronUp size={14} aria-hidden />}
            </button>
          )}
        </div>
      </div>
      )}

      {!collapsed && (
        <>
          {/* Window edges + the playhead's own label, as legacy draws them:
              along the bottom of its canvas (`scrubleft`, `scrubright`,
              `scruboutput`), above the tracks in the modern card. */}
          {!classic && labelLane}

          {/* Tracks + playhead */}
          <div
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
                filters={filters}
                classic={classic}
              />
            ))}

            {/* Playhead — spans every track, on the bars' own axis. Above the
                name column (z-10) so its marker is never covered. */}
            <div
              ref={laneRef}
              className={`absolute ${nameColumn} end-0 top-0 bottom-0 pointer-events-none z-20`}
              data-testid="review-timeline-lane"
            >
              <div
                className="absolute top-0 bottom-0"
                style={{ left: `${playheadPct}%` }}
                data-testid="review-timeline-playhead"
              >
                {classic ? (
                  // Legacy's slider: a 10 px bar the height of the canvas.
                  <div className="h-full w-2.5 -translate-x-1/2 bg-white/60 border-x border-white" />
                ) : (
                  <>
                    <div className="w-px h-full bg-accent" />
                    <div className="absolute -top-1 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-accent" />
                  </>
                )}
              </div>
            </div>
            {/* Inside the seek box: legacy's canvas seeks on its label row too. */}
            {classic && labelLane}
          </div>
        </>
      )}
    </div>
  );
}

interface TrackProps {
  monitor: Monitor;
  rangeStart: Date;
  rangeEnd: Date;
  filters: ReviewEventFilters;
  classic: boolean;
}

function Track({ monitor, rangeStart, rangeEnd, filters, classic }: TrackProps) {
  const { events } = useReviewEvents(monitor.id, rangeStart, rangeEnd, filters);
  const { framesByEvent, maxScore } = useFrameScores(events);
  const durationMs = rangeEnd.getTime() - rangeStart.getTime();
  const colour = monitorColour(monitor);

  return (
    <div className={classic
      ? 'relative h-5 flex items-center'
      : 'relative h-8 flex items-center border-b border-border-subtle/30 last:border-b-0'}
    >
      {classic ? (
        // Legacy `drawGraph`: the name in white Georgia over the row.
        <div className="absolute start-0 top-0 bottom-0 px-1 flex items-center z-10 pointer-events-none max-w-full">
          <span className="text-sm leading-none font-serif text-white truncate">{monitor.name}</span>
        </div>
      ) : (
        <div className="absolute start-0 top-0 bottom-0 w-32 px-3 flex items-center bg-surface border-e border-border-subtle z-10">
          <span className="text-xs text-fg-muted truncate font-medium">
            {monitor.name}
          </span>
        </div>
      )}
      <div className={`absolute ${classic ? CLASSIC_NAME_COLUMN : NAME_COLUMN} end-0 top-0 bottom-0`} data-testid="review-track-bars">
        {events.map((event) => (
          <EventBar
            key={event.id}
            event={event}
            colour={colour}
            rangeStart={rangeStart}
            durationMs={durationMs}
            frames={framesByEvent.get(event.id)}
            maxScore={maxScore}
            classic={classic}
          />
        ))}
      </div>
    </div>
  );
}

interface EventBarProps {
  event: ZmEvent;
  colour: string;
  rangeStart: Date;
  durationMs: number;
  frames?: Array<{ frame_id: number; score: number; time_stamp: string }>;
  maxScore: number;
  classic: boolean;
}

function EventBar({ event, colour, rangeStart, durationMs, frames, maxScore, classic }: EventBarProps) {
  if (!event.start_date_time || durationMs <= 0) return null;
  const start = Date.parse(event.start_date_time);
  if (isNaN(start)) return null;
  // Same rule as the cell lookup: an in-progress event runs up to now.
  const end = eventEndMs(event) ?? start;
  const pctOf = (ms: number) => ((ms - rangeStart.getTime()) / durationMs) * 100;
  const leftPct = pctOf(start);
  const widthPct = Math.max(0.2, ((end - start) / durationMs) * 100);

  // Out of range
  if (leftPct + widthPct < 0 || leftPct > 100) return null;

  return (
    <>
      <div
        data-testid={`review-event-bar-${event.id}`}
        // Legacy fills the row less 2 px, square; the card uses a slimmer pill.
        className={classic
          ? 'absolute top-0 bottom-0.5 pointer-events-none'
          : 'absolute top-1/2 -translate-y-1/2 h-3 rounded pointer-events-none'}
        style={{
          left: `${Math.max(0, leftPct)}%`,
          width: `${Math.min(100 - Math.max(0, leftPct), widthPct)}%`,
          // Legacy draws the event bar in the monitor's colour at α .2 and
          // the scored frames over it, darker.
          backgroundColor: colour,
          opacity: 0.2,
        }}
        title={`${event.name} — ${event.start_date_time}`}
      />
      {frames?.map((frame) => {
        const ts = Date.parse(frame.time_stamp);
        if (isNaN(ts)) return null;
        const pct = pctOf(ts);
        if (pct < 0 || pct > 100) return null;
        return (
          <div
            key={frame.frame_id}
            data-testid={`review-frame-${frame.frame_id}`}
            className={classic
              ? 'absolute top-0 bottom-0.5 pointer-events-none'
              : 'absolute top-1/2 -translate-y-1/2 h-3 pointer-events-none'}
            style={{
              left: `${pct}%`,
              width: 2,
              backgroundColor: colour,
              opacity: frameAlpha(frame.score, maxScore),
            }}
          />
        );
      })}
    </>
  );
}

/** Window-edge label: time inside a day, date once the window spans days. */
function formatEdge(t: Date, durationMs: number): string {
  const hours = durationMs / (1000 * 60 * 60);
  if (hours <= 48) {
    return t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return t.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

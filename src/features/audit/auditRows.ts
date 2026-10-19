import type { Monitor, ZmEvent } from '@/types';
import type { MonitorEventAudit } from '@/api/reports';

/**
 * Per-monitor rollup of legacy `?view=report_event_audit`: event count in
 * the window, first and last event, and the smallest / largest gap between
 * consecutive events (seconds from one event's end to the next one's start,
 * clamped at 0 for overlaps). Pure so it is testable without the network.
 */
export interface AuditMonitorStats {
  events: number;
  first: { id: number; at: string } | null;
  /** `ended`: `at` is when the event ended, not when it started. */
  last: { id: number; at: string; ended?: boolean } | null;
  minGap: number | null;
  maxGap: number | null;
}

/** Events in the window with no media on disk, or an empty video file. */
export interface AuditFileChecks {
  missing: number[];
  zeroSize: number[];
}

export interface AuditRow {
  monitor: Monitor;
  stats: AuditMonitorStats;
  /** Still paging through `/events` for this monitor. */
  loading: boolean;
  error: Error | null;
  /** From `/reports/event-audit`; null when the page does not ask for it. */
  files: AuditFileChecks | null;
}

export const EMPTY_STATS: AuditMonitorStats = { events: 0, first: null, last: null, minGap: null, maxGap: null };

type EventRef = Pick<ZmEvent, 'id' | 'start_date_time' | 'end_date_time' | 'length'>;

function startMs(e: EventRef): number {
  return e.start_date_time ? Date.parse(e.start_date_time) : NaN;
}

function endMs(e: EventRef): number {
  if (e.end_date_time) return Date.parse(e.end_date_time);
  const s = startMs(e);
  const len = Number(e.length);
  return Number.isFinite(s) && Number.isFinite(len) ? s + len * 1000 : NaN;
}

export function computeAuditStats(events: EventRef[]): AuditMonitorStats {
  const sorted = events
    .filter((e) => Number.isFinite(startMs(e)))
    .sort((a, b) => startMs(a) - startMs(b) || a.id - b.id);
  if (sorted.length === 0) return { ...EMPTY_STATS, events: events.length };

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  let minGap: number | null = null;
  let maxGap: number | null = null;
  for (let i = 1; i < sorted.length; i++) {
    const prevEnd = endMs(sorted[i - 1]);
    if (!Number.isFinite(prevEnd)) continue;
    const gap = Math.max(0, Math.round((startMs(sorted[i]) - prevEnd) / 1000));
    minGap = minGap === null ? gap : Math.min(minGap, gap);
    maxGap = maxGap === null ? gap : Math.max(maxGap, gap);
  }
  return {
    events: events.length,
    first: { id: first.id, at: first.start_date_time! },
    last: { id: last.id, at: last.start_date_time! },
    minGap,
    maxGap,
  };
}

/**
 * One monitor's row from `GET /reports/event-audit`. The server counts the
 * events that overlap the window (legacy's `EndDateTime > min AND
 * StartDateTime < max`) and measures each gap from one event's end to the
 * next one's start, so overlapping events give a negative gap. It reports
 * when the last event ended, not when it started. No entry means no events.
 */
export function statsFromEventAudit(entry: MonitorEventAudit | undefined): { stats: AuditMonitorStats; files: AuditFileChecks } {
  if (!entry || entry.event_count === 0) {
    return { stats: EMPTY_STATS, files: { missing: [], zeroSize: [] } };
  }
  return {
    stats: {
      events: entry.event_count,
      first: entry.first_start ? { id: entry.first_event_id, at: entry.first_start } : null,
      last: entry.last_end ? { id: entry.last_event_id, at: entry.last_end, ended: true } : null,
      minGap: entry.min_gap_seconds ?? null,
      maxGap: entry.max_gap_seconds ?? null,
    },
    files: { missing: entry.missing_files, zeroSize: entry.zero_size },
  };
}

export type AuditSortKey = 'id' | 'name' | 'server' | 'events' | 'first' | 'last' | 'minGap' | 'maxGap' | 'missing' | 'zeroSize';

export function compareAuditRows(a: AuditRow, b: AuditRow, key: AuditSortKey): number {
  // Unknown sorts first; gaps can be negative (overlapping events), so no sentinel.
  const num = (x: number | null, y: number | null) => (x === null ? (y === null ? 0 : -1) : y === null ? 1 : x - y);
  const at = (x: { at: string } | null) => (x ? Date.parse(x.at) : -1);
  switch (key) {
    case 'id': return a.monitor.id - b.monitor.id;
    case 'name': return a.monitor.name.localeCompare(b.monitor.name);
    case 'server': return (a.monitor.server_id ?? 0) - (b.monitor.server_id ?? 0);
    case 'events': return a.stats.events - b.stats.events;
    case 'first': return at(a.stats.first) - at(b.stats.first);
    case 'last': return at(a.stats.last) - at(b.stats.last);
    case 'minGap': return num(a.stats.minGap, b.stats.minGap);
    case 'maxGap': return num(a.stats.maxGap, b.stats.maxGap);
    case 'missing': return num(a.files?.missing.length ?? null, b.files?.missing.length ?? null);
    case 'zeroSize': return num(a.files?.zeroSize.length ?? null, b.files?.zeroSize.length ?? null);
  }
}

/** Default window: the hour that ended an hour ago (legacy `now-2h → now-1h`). */
export function defaultAuditWindow(now: Date = new Date()): { min: Date; max: Date } {
  return {
    min: new Date(now.getTime() - 2 * 3_600_000),
    max: new Date(now.getTime() - 3_600_000),
  };
}

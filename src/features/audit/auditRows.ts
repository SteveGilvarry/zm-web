import type { Monitor, ZmEvent } from '@/types';

/**
 * Per-monitor rollup of legacy `?view=report_event_audit`: event count in
 * the window, first and last event, and the smallest / largest gap between
 * consecutive events (seconds from one event's end to the next one's start,
 * clamped at 0 for overlaps). Pure so it is testable without the network.
 */
export interface AuditMonitorStats {
  events: number;
  first: { id: number; at: string } | null;
  last: { id: number; at: string } | null;
  minGap: number | null;
  maxGap: number | null;
}

export interface AuditRow {
  monitor: Monitor;
  stats: AuditMonitorStats;
  /** Still paging through `/events` for this monitor. */
  loading: boolean;
  error: Error | null;
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

export type AuditSortKey = 'id' | 'name' | 'server' | 'events' | 'first' | 'last' | 'minGap' | 'maxGap';

export function compareAuditRows(a: AuditRow, b: AuditRow, key: AuditSortKey): number {
  const num = (x: number | null) => (x === null ? -1 : x);
  const at = (x: { at: string } | null) => (x ? Date.parse(x.at) : -1);
  switch (key) {
    case 'id': return a.monitor.id - b.monitor.id;
    case 'name': return a.monitor.name.localeCompare(b.monitor.name);
    case 'server': return (a.monitor.server_id ?? 0) - (b.monitor.server_id ?? 0);
    case 'events': return a.stats.events - b.stats.events;
    case 'first': return at(a.stats.first) - at(b.stats.first);
    case 'last': return at(a.stats.last) - at(b.stats.last);
    case 'minGap': return num(a.stats.minGap) - num(b.stats.minGap);
    case 'maxGap': return num(a.stats.maxGap) - num(b.stats.maxGap);
  }
}

/** Default window: the hour that ended an hour ago (legacy `now-2h → now-1h`). */
export function defaultAuditWindow(now: Date = new Date()): { min: Date; max: Date } {
  return {
    min: new Date(now.getTime() - 2 * 3_600_000),
    max: new Date(now.getTime() - 3_600_000),
  };
}

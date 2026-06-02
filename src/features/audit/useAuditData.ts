import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getMonitors } from '@/api/monitors';
import { listEventSummaries, type EventSummary } from '@/api/eventSummaries';
import { useAuthStore } from '@/stores/auth';
import type { Monitor } from '@/types';

export interface AuditRow {
  monitor: Monitor;
  summary: EventSummary;
}

export interface AuditData {
  rows: AuditRow[];
  loading: boolean;
  error: Error | null;
}

const EMPTY_SUMMARY: EventSummary = {
  monitor_id: 0,
  total_events: 0, total_event_disk_space: 0,
  hour_events: 0, hour_event_disk_space: 0,
  day_events: 0, day_event_disk_space: 0,
  week_events: 0, week_event_disk_space: 0,
  month_events: 0, month_event_disk_space: 0,
  archived_events: 0, archived_event_disk_space: 0,
};

/**
 * One-shot loader for the per-monitor event-integrity audit:
 * joins `GET /api/v3/monitors` with `GET /api/v3/event-summaries`
 * so each row has the monitor metadata + total/hour/day/week/month/archived
 * counts + disk_space. Refreshes once a minute — event counters don't move
 * fast enough to warrant aggressive polling.
 */
export function useAuditData(): AuditData {
  const { isAuthenticated } = useAuthStore();

  const monitorsQ = useQuery({
    queryKey: ['monitors'],
    queryFn: () => getMonitors({ page: 1, page_size: 200 }),
    enabled: isAuthenticated,
    refetchInterval: 60_000,
  });

  const summariesQ = useQuery({
    queryKey: ['eventSummaries'],
    queryFn: () => listEventSummaries({ page: 1, page_size: 200 }),
    enabled: isAuthenticated,
    refetchInterval: 60_000,
  });

  const rows = useMemo<AuditRow[]>(() => {
    const monitors = monitorsQ.data?.items ?? [];
    const summaries = summariesQ.data?.items ?? [];
    const byMonitor = new Map<number, EventSummary>();
    for (const s of summaries) byMonitor.set(s.monitor_id, s);
    return monitors.map((monitor) => ({
      monitor,
      summary: byMonitor.get(monitor.id) ?? { ...EMPTY_SUMMARY, monitor_id: monitor.id },
    }));
  }, [monitorsQ.data, summariesQ.data]);

  return {
    rows,
    loading: monitorsQ.isLoading || summariesQ.isLoading,
    error: (monitorsQ.error as Error | null) ?? (summariesQ.error as Error | null) ?? null,
  };
}

export type AuditSortKey =
  | 'id' | 'name'
  | 'total' | 'hour' | 'day' | 'week' | 'month' | 'archived';

export interface AuditTotals {
  total: number;       total_disk: number;
  hour: number;        hour_disk: number;
  day: number;         day_disk: number;
  week: number;        week_disk: number;
  month: number;       month_disk: number;
  archived: number;    archived_disk: number;
}

export function computeAuditTotals(rows: AuditRow[]): AuditTotals {
  const t: AuditTotals = {
    total: 0, total_disk: 0,
    hour: 0, hour_disk: 0,
    day: 0, day_disk: 0,
    week: 0, week_disk: 0,
    month: 0, month_disk: 0,
    archived: 0, archived_disk: 0,
  };
  for (const { summary: s } of rows) {
    t.total    += s.total_events;       t.total_disk    += s.total_event_disk_space;
    t.hour     += s.hour_events;        t.hour_disk     += s.hour_event_disk_space;
    t.day      += s.day_events;         t.day_disk      += s.day_event_disk_space;
    t.week     += s.week_events;        t.week_disk     += s.week_event_disk_space;
    t.month    += s.month_events;       t.month_disk    += s.month_event_disk_space;
    t.archived += s.archived_events;    t.archived_disk += s.archived_event_disk_space;
  }
  return t;
}

export function compareAuditRows(
  a: AuditRow,
  b: AuditRow,
  key: AuditSortKey,
): number {
  switch (key) {
    case 'id':       return a.monitor.id - b.monitor.id;
    case 'name':     return a.monitor.name.localeCompare(b.monitor.name);
    case 'total':    return a.summary.total_events    - b.summary.total_events;
    case 'hour':     return a.summary.hour_events     - b.summary.hour_events;
    case 'day':      return a.summary.day_events      - b.summary.day_events;
    case 'week':     return a.summary.week_events     - b.summary.week_events;
    case 'month':    return a.summary.month_events    - b.summary.month_events;
    case 'archived': return a.summary.archived_events - b.summary.archived_events;
  }
}

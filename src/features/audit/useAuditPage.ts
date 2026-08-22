import { useMemo, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useAuthStore } from '@/stores/auth';
import { toLocalDatetime } from '@/features/reports/datetime';
import { dateInputToStartTime } from '@/features/events/useEventsListPage';
import { toZmDateTime } from '@/features/events/eventsSearch';
import type { Monitor } from '@/types';
import { compareAuditRows, defaultAuditWindow, type AuditRow, type AuditSortKey } from './auditRows';
import { useAuditData, useAuditMonitors } from './useAuditData';

export type AuditSortDir = 'asc' | 'desc';

export interface AuditPageState {
  isAuthenticated: boolean;
  /** Every monitor (input to the filter bar). */
  allMonitors: Monitor[];
  monitorsLoading: boolean;
  monitorsError: Error | null;
  refetch: () => void;
  /** Monitors after the filter bar. */
  setVisibleMonitors: (m: Monitor[]) => void;

  /** Window bounds as `datetime-local` values (local wall clock). */
  minInput: string;
  maxInput: string;
  setWindow: (min: string, max: string) => void;
  /** Bounds in ZoneMinder's `YYYY-MM-DD HH:MM:SS` form, for deep links. */
  minZm: string;
  maxZm: string;

  sortKey: AuditSortKey;
  sortDir: AuditSortDir;
  toggleSort: (key: AuditSortKey) => void;
  /** Rows in display order. */
  sorted: AuditRow[];
  serverName: (serverId: number | null | undefined) => string;
  truncatedMonitorIds: number[];
  totals: { events: number };

  /** Search params for the deep links a row carries. */
  reviewSearch: (monitorId: number) => { monitor_id: number; min_time: string; max_time: string };
  eventsSearch: (monitorId: number) => { monitor_id: number; start: string; end: string };
}

/**
 * Event audit (legacy `?view=report_event_audit`): a time window (default
 * the hour that ended an hour ago, kept in `?min_time&max_time`), the shared
 * monitor filter bar, and per-monitor Events / First / Last / MinGap /
 * MaxGap computed from that monitor's events inside the window.
 */
export function useAuditPage(): AuditPageState {
  const { isAuthenticated } = useAuthStore();
  const search = useSearch({ from: '/audit/' }) as { min_time?: string; max_time?: string };
  const navigate = useNavigate({ from: '/audit/' });

  const [defaults] = useState(() => defaultAuditWindow());
  const minInput = search.min_time ? normaliseInput(search.min_time) : toLocalDatetime(defaults.min);
  const maxInput = search.max_time ? normaliseInput(search.max_time) : toLocalDatetime(defaults.max);
  const minIso = dateInputToStartTime(minInput);
  const maxIso = dateInputToStartTime(maxInput);

  const setWindow = (min: string, max: string) => {
    navigate({
      search: () => ({ min_time: min || undefined, max_time: max || undefined }),
      replace: true,
    });
  };

  const all = useAuditMonitors();
  const [visible, setVisible] = useState<Monitor[] | null>(null);
  const monitors = visible ?? all.monitors;
  const data = useAuditData(monitors, minIso, maxIso);

  const [sortKey, setSortKey] = useState<AuditSortKey>('id');
  const [sortDir, setSortDir] = useState<AuditSortDir>('asc');
  const sorted = useMemo(() => {
    const copy = data.rows.slice();
    copy.sort((a, b) => {
      const cmp = compareAuditRows(a, b, sortKey);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [data.rows, sortKey, sortDir]);

  const toggleSort = (key: AuditSortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const minZm = toZmDateTime(minInput);
  const maxZm = toZmDateTime(maxInput);

  return {
    isAuthenticated,
    allMonitors: all.monitors,
    monitorsLoading: all.isLoading,
    monitorsError: all.error,
    refetch: () => { all.refetch(); data.refetch(); },
    setVisibleMonitors: setVisible,

    minInput,
    maxInput,
    setWindow,
    minZm,
    maxZm,

    sortKey,
    sortDir,
    toggleSort,
    sorted,
    serverName: data.serverName,
    truncatedMonitorIds: data.truncatedMonitorIds,
    totals: { events: sorted.reduce((n, r) => n + r.stats.events, 0) },

    reviewSearch: (monitorId) => ({ monitor_id: monitorId, min_time: minZm, max_time: maxZm }),
    eventsSearch: (monitorId) => ({ monitor_id: monitorId, start: minInput, end: maxInput }),
  };
}

/** Legacy `2026-08-21 06:37:03` or ISO → `datetime-local` value (seconds kept). */
function normaliseInput(v: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)(?:$|Z|[+-])/.exec(v);
  if (m) return `${m[1]}T${m[2]}`;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : toLocalDatetime(d);
}

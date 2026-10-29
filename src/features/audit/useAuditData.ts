import { useQueries, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getEvents } from '@/api/events';
import { getAllMonitors } from '@/api/monitors';
import { listServers } from '@/api/servers';
import { getEventAudit } from '@/api/reports';
import { useAuthStore } from '@/stores/auth';
import type { Monitor, ZmEvent } from '@/types';
import { computeAuditStats, EMPTY_STATS, statsFromEventAudit, type AuditRow } from './auditRows';

/** Page size and cap when walking one monitor's events inside the window. */
const PAGE = 500;
const MAX_PAGES = 20;

/**
 * Every event of one monitor that starts after `min` and has ended by `max`.
 * (The API bounds `start_time` on start and `end_time` on end; legacy audits
 * on overlap, so an event still running at `max` is not counted — noted in
 * the page.) Pages are walked in start order until the last one.
 */
export async function fetchMonitorWindowEvents(
  monitorId: number,
  min: string,
  max: string,
): Promise<{ events: ZmEvent[]; truncated: boolean }> {
  const events: ZmEvent[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await getEvents({
      monitor_id: monitorId, start_time: min, end_time: max,
      sort: 'start_time', direction: 'asc', page, page_size: PAGE,
    });
    events.push(...res.items);
    if (res.current_page >= res.last_page || res.items.length === 0) return { events, truncated: false };
  }
  return { events, truncated: true };
}

export interface AuditData {
  monitors: Monitor[];
  rows: AuditRow[];
  serverName: (serverId: number | null | undefined) => string;
  monitorsLoading: boolean;
  monitorsError: Error | null;
  /** Any monitor whose walk hit the page cap. */
  truncatedMonitorIds: number[];
  refetch: () => void;
}

/**
 * Per-monitor event audit for one time window: monitors + servers once,
 * then the figures for each listed monitor inside `[min, max]` (ISO stamps).
 *
 * Two sources. By default the events of each monitor are paged through
 * `/events` and rolled up here, so rows fill in as they arrive. With
 * `fromServer`, one `GET /reports/event-audit` answers for every monitor,
 * including the file checks (missing media, empty video) only the server
 * can make, with no page cap.
 */
export function useAuditData(
  monitors: Monitor[],
  min: string,
  max: string,
  { fromServer = false }: { fromServer?: boolean } = {},
): AuditData {
  const { isAuthenticated } = useAuthStore();
  const ready = isAuthenticated && !!min && !!max;

  const auditQ = useQuery({
    queryKey: ['audit', 'event-audit', min, max],
    queryFn: () => getEventAudit({ start: min, end: max }),
    enabled: ready && fromServer,
    staleTime: 60_000,
  });

  const serversQ = useQuery({
    queryKey: ['servers'],
    queryFn: () => listServers({ page: 1, page_size: 100 }),
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
  });

  const eventQs = useQueries({
    queries: monitors.map((m) => ({
      queryKey: ['audit', 'events', m.id, min, max],
      queryFn: () => fetchMonitorWindowEvents(m.id, min, max),
      enabled: ready && !fromServer,
      staleTime: 60_000,
    })),
  });

  // `useQueries` hands back a fresh array every render, so the memo keys off a
  // string built from the parts the rows actually read. (A spread dependency
  // list is not an array literal, which the React Compiler rules reject — and
  // it changes length as monitors load, which hooks may not do anyway.)
  const rowsKey = eventQs
    .map((q) => `${q.dataUpdatedAt}:${q.isLoading ? 1 : 0}:${q.errorUpdatedAt}`)
    .join('|');

  const auditData = auditQ.data;
  const auditLoading = auditQ.isLoading;
  const auditError = (auditQ.error as Error | null) ?? null;
  const rows = useMemo<AuditRow[]>(
    () => monitors.map((monitor, i) => {
      if (fromServer) {
        const { stats, files } = statsFromEventAudit(auditData?.monitors.find((m) => m.monitor_id === monitor.id));
        return {
          monitor,
          stats: auditData ? stats : EMPTY_STATS,
          loading: auditLoading,
          error: auditError,
          files: auditData ? files : null,
        };
      }
      const q = eventQs[i];
      return {
        monitor,
        stats: q?.data ? computeAuditStats(q.data.events) : EMPTY_STATS,
        loading: q?.isLoading ?? false,
        error: (q?.error as Error | null) ?? null,
        files: null,
      };
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monitors, rowsKey, fromServer, auditData, auditLoading, auditError],
  );

  const truncatedMonitorIds = monitors.filter((_, i) => eventQs[i]?.data?.truncated).map((m) => m.id);

  const serverName = (id: number | null | undefined) => {
    if (id == null || id === 0) return '';
    return serversQ.data?.items.find((s) => s.id === id)?.name ?? String(id);
  };

  return {
    monitors,
    rows,
    serverName,
    monitorsLoading: false,
    monitorsError: null,
    truncatedMonitorIds,
    refetch: () => {
      if (fromServer) void auditQ.refetch();
      else eventQs.forEach((q) => { q.refetch(); });
    },
  };
}

/** All monitors, for the filter bar to narrow. */
export function useAuditMonitors(): { monitors: Monitor[]; isLoading: boolean; error: Error | null; refetch: () => void } {
  const { isAuthenticated } = useAuthStore();
  const q = useQuery({
    queryKey: ['monitors', 'all'],
    queryFn: () => getAllMonitors(),
    enabled: isAuthenticated,
    refetchInterval: 60_000,
  });
  return {
    monitors: useMemo(() => q.data ?? [], [q.data]),
    isLoading: q.isLoading,
    error: (q.error as Error | null) ?? null,
    refetch: () => { q.refetch(); },
  };
}

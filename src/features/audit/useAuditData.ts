import { useQueries, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getEvents } from '@/api/events';
import { getMonitors } from '@/api/monitors';
import { listServers } from '@/api/servers';
import { useAuthStore } from '@/stores/auth';
import type { Monitor, ZmEvent } from '@/types';
import { computeAuditStats, EMPTY_STATS, type AuditRow } from './auditRows';

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
 * then the events of each listed monitor inside `[min, max]` (ISO stamps),
 * paged per monitor so rows fill in as they arrive.
 */
export function useAuditData(monitors: Monitor[], min: string, max: string): AuditData {
  const { isAuthenticated } = useAuthStore();

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
      enabled: isAuthenticated && !!min && !!max,
      staleTime: 60_000,
    })),
  });

  const rows = useMemo<AuditRow[]>(
    () => monitors.map((monitor, i) => {
      const q = eventQs[i];
      return {
        monitor,
        stats: q?.data ? computeAuditStats(q.data.events) : EMPTY_STATS,
        loading: q?.isLoading ?? false,
        error: (q?.error as Error | null) ?? null,
      };
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monitors, ...eventQs.map((q) => q.data), ...eventQs.map((q) => q.isLoading), ...eventQs.map((q) => q.error)],
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
    refetch: () => { eventQs.forEach((q) => { q.refetch(); }); },
  };
}

/** All monitors, for the filter bar to narrow. */
export function useAuditMonitors(): { monitors: Monitor[]; isLoading: boolean; error: Error | null; refetch: () => void } {
  const { isAuthenticated } = useAuthStore();
  const q = useQuery({
    queryKey: ['monitors'],
    queryFn: () => getMonitors({ page: 1, page_size: 200 }),
    enabled: isAuthenticated,
    refetchInterval: 60_000,
  });
  return {
    monitors: useMemo(() => q.data?.items ?? [], [q.data]),
    isLoading: q.isLoading,
    error: (q.error as Error | null) ?? null,
    refetch: () => { q.refetch(); },
  };
}

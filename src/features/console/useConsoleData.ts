import { useQuery } from '@tanstack/react-query';
import { getMonitors, getLiveSessions } from '@/api/monitors';
import {
  getEvents,
  getEventCounts,
  getEventCountsByMonitor,
  type EventCountByMonitor,
} from '@/api/events';
import { getDaemons, getSystemStatus } from '@/api/system';
import { useAuthStore } from '@/stores/auth';
import type { Monitor, ZmEvent, DaemonStatus } from '@/types';
import type { SystemStats } from '@/api/system';

export interface ConsoleData {
  monitors: Monitor[];
  liveSessions: number[];
  events: ZmEvent[];
  eventCount24h: number;
  daemons: DaemonStatus[];
  isSystemRunning: boolean | undefined;
  systemStats: SystemStats | undefined;
  /**
   * Per-monitor event counts over four timeframes. Lookup helper provided
   * since the API returns flat arrays of {monitor_id, count}.
   */
  countsByMonitor: {
    hour: EventCountByMonitor[];
    day: EventCountByMonitor[];
    week: EventCountByMonitor[];
    month: EventCountByMonitor[];
  };
  loading: {
    monitors: boolean;
    events: boolean;
  };
}

/**
 * One-stop shop for everything both skins of the Console page need:
 * monitor list, live sessions, recent events, system stats, and per-monitor
 * event counts over Hour / Day / Week / Month windows. The modern Console
 * uses these for its stat cards + thumbnail grid; the classic Console uses
 * the same data to render a sortable monitor table.
 */
export function useConsoleData(): ConsoleData {
  const { isAuthenticated } = useAuthStore();

  const monitorsQ = useQuery({
    queryKey: ['monitors'],
    queryFn: () => getMonitors({ page: 1, page_size: 100 }),
    enabled: isAuthenticated,
    refetchInterval: 30_000,
  });
  const liveSessionsQ = useQuery({
    queryKey: ['liveSessions'],
    queryFn: getLiveSessions,
    enabled: isAuthenticated,
    refetchInterval: 10_000,
  });
  const eventsQ = useQuery({
    queryKey: ['recentEvents'],
    queryFn: () => getEvents({ page: 1, page_size: 10 }),
    enabled: isAuthenticated,
    refetchInterval: 15_000,
  });
  const counts24Q = useQuery({
    queryKey: ['eventCounts', 24],
    queryFn: () => getEventCounts(24),
    enabled: isAuthenticated,
    refetchInterval: 60_000,
  });
  const daemonsQ = useQuery({
    queryKey: ['daemons'],
    queryFn: getDaemons,
    enabled: isAuthenticated,
    refetchInterval: 30_000,
  });
  const systemQ = useQuery({
    queryKey: ['systemStatus'],
    queryFn: getSystemStatus,
    enabled: isAuthenticated,
    refetchInterval: 10_000,
  });

  // Per-monitor counts over 4 timeframes (hours).
  const cbmHourQ = useQuery({
    queryKey: ['eventCountsByMonitor', 1],
    queryFn: () => getEventCountsByMonitor(1),
    enabled: isAuthenticated,
    refetchInterval: 60_000,
  });
  const cbmDayQ = useQuery({
    queryKey: ['eventCountsByMonitor', 24],
    queryFn: () => getEventCountsByMonitor(24),
    enabled: isAuthenticated,
    refetchInterval: 60_000,
  });
  const cbmWeekQ = useQuery({
    queryKey: ['eventCountsByMonitor', 168],
    queryFn: () => getEventCountsByMonitor(168),
    enabled: isAuthenticated,
    refetchInterval: 120_000,
  });
  const cbmMonthQ = useQuery({
    queryKey: ['eventCountsByMonitor', 720],
    queryFn: () => getEventCountsByMonitor(720),
    enabled: isAuthenticated,
    refetchInterval: 300_000,
  });

  return {
    monitors: monitorsQ.data?.items ?? [],
    liveSessions: liveSessionsQ.data ?? [],
    events: eventsQ.data?.items ?? [],
    eventCount24h: counts24Q.data?.total ?? 0,
    daemons: daemonsQ.data?.daemons ?? [],
    isSystemRunning: systemQ.data?.running,
    systemStats: systemQ.data?.stats,
    countsByMonitor: {
      hour:  cbmHourQ.data  ?? [],
      day:   cbmDayQ.data   ?? [],
      week:  cbmWeekQ.data  ?? [],
      month: cbmMonthQ.data ?? [],
    },
    loading: {
      monitors: monitorsQ.isLoading,
      events: eventsQ.isLoading,
    },
  };
}

/** Helper: count for a monitor in a given timeframe bucket. */
export function lookupCount(
  buckets: EventCountByMonitor[] | undefined,
  monitorId: number,
): number {
  if (!Array.isArray(buckets)) return 0;
  return buckets.find((b) => b.monitor_id === monitorId)?.count ?? 0;
}

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getMonitors, getLiveSessions } from '@/api/monitors';
import {
  getEvents,
  getEventCounts,
} from '@/api/events';
import { listEventSummaries, type EventSummary } from '@/api/eventSummaries';
import { getDaemons, getSystemStatus } from '@/api/system';
import { useAuthStore } from '@/stores/auth';
import { bucketEventsByHour } from './bucketEvents';
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
   * Per-monitor event summaries — event counts AND disk_space for each of
   * total / hour / day / week / month / archived. Sourced from a single
   * /event-summaries call instead of four /events/counts-by-monitor calls.
   */
  summariesByMonitor: EventSummary[];
  /**
   * Last-24h hourly histogram per monitor, computed client-side from the
   * raw events list (no backend endpoint exists for this shape yet). Each
   * monitor's entry is a 24-length array indexed by hours-ago: index 0 =
   * the current hour, index 23 = 24 hours ago. Empty object if data hasn't
   * loaded yet. Plain Record (not Map) because React Compiler's value-
   * change detection treats Maps as opaque references.
   */
  hourlyByMonitor: Record<number, number[]>;
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

  // Raw events for the last 24h — used to bucket per-monitor hourly
  // histograms for the sparkline. Capped at 1000 entries (~5MB worst-case
  // wire size); past that the spark just under-counts the quiet hours
  // furthest in the past, which doesn't hurt readability.
  const last24hQ = useQuery({
    queryKey: ['events', 'last24h'],
    queryFn: () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      return getEvents({ page: 1, page_size: 1000, start_time: since });
    },
    enabled: isAuthenticated,
    refetchInterval: 60_000,
  });


  // One call replaces the four per-timeframe count queries below — the
  // backend pre-calculates count + disk_space rollups for every timeframe.
  const summariesQ = useQuery({
    queryKey: ['eventSummaries'],
    queryFn: () => listEventSummaries({ page: 1, page_size: 200 }),
    enabled: isAuthenticated,
    refetchInterval: 60_000,
  });

  // Bucket the last-24h events into a per-monitor × per-hour histogram.
  // Pure logic lives in bucketEventsByHour for testability.
  const last24hEvents = last24hQ.data?.items;
  const hourlyByMonitor = useMemo(
    () => bucketEventsByHour(last24hEvents),
    [last24hEvents],
  );

  return {
    monitors: monitorsQ.data?.items ?? [],
    liveSessions: liveSessionsQ.data ?? [],
    events: eventsQ.data?.items ?? [],
    eventCount24h: counts24Q.data?.total ?? 0,
    daemons: daemonsQ.data?.daemons ?? [],
    isSystemRunning: systemQ.data?.running,
    systemStats: systemQ.data?.stats,
    summariesByMonitor: summariesQ.data?.items ?? [],
    hourlyByMonitor,
    loading: {
      monitors: monitorsQ.isLoading,
      events: eventsQ.isLoading,
    },
  };
}

/** Empty-summary placeholder so callers can rely on a row always existing. */
const EMPTY_SUMMARY: EventSummary = {
  monitor_id: 0,
  total_events: 0, total_event_disk_space: 0,
  hour_events: 0, hour_event_disk_space: 0,
  day_events: 0, day_event_disk_space: 0,
  week_events: 0, week_event_disk_space: 0,
  month_events: 0, month_event_disk_space: 0,
  archived_events: 0, archived_event_disk_space: 0,
};

/** Look up a monitor's summary row; returns a zeroed row if absent. */
export function lookupSummary(
  summaries: EventSummary[] | undefined,
  monitorId: number,
): EventSummary {
  if (!Array.isArray(summaries)) return { ...EMPTY_SUMMARY, monitor_id: monitorId };
  return (
    summaries.find((s) => s.monitor_id === monitorId)
    ?? { ...EMPTY_SUMMARY, monitor_id: monitorId }
  );
}

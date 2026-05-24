import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
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

  // Bucket the last-24h events into a per-monitor × per-hour histogram.
  // Index 0 = the current hour (most recent), index 23 = 24h ago. Anchor
  // 'now' against the freshest event in the response rather than the
  // client clock so the histogram stays correct even when the camera /
  // backend clock drifts ahead or behind the browser.
  const last24hEvents = last24hQ.data?.items;
  const hourlyByMonitor = useMemo(() => {
    const out: Record<number, number[]> = {};
    if (!last24hEvents || last24hEvents.length === 0) return out;

    // Pick the latest event timestamp as the right edge of the spark; fall
    // back to client time if no events have parseable timestamps.
    let latest = 0;
    for (const e of last24hEvents) {
      if (!e.start_date_time) continue;
      const t = Date.parse(e.start_date_time);
      if (!Number.isNaN(t) && t > latest) latest = t;
    }
    const anchor = latest > 0 ? latest : Date.now();

    for (const e of last24hEvents) {
      if (!e.start_date_time) continue;
      const t = Date.parse(e.start_date_time);
      if (Number.isNaN(t)) continue;
      // Slot the event by hours-before-anchor. Clamp negatives to 0 so a
      // tiny bit of clock skew past 'anchor' doesn't drop the freshest
      // event; cap at 23 so anything older than the window doesn't poison
      // the spark.
      let hoursAgo = Math.floor((anchor - t) / (60 * 60 * 1000));
      if (hoursAgo < 0) hoursAgo = 0;
      if (hoursAgo > 23) continue;
      const buckets = out[e.monitor_id] ?? (out[e.monitor_id] = new Array(24).fill(0));
      buckets[hoursAgo] += 1;
    }
    return out;
  }, [last24hEvents]);

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
    hourlyByMonitor,
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

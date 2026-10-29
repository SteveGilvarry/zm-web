import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { getAllFramesForEvent, type Frame } from '@/api/frames';
import { listStats } from '@/api/stats';
import { listZonesForMonitor } from '@/api/zones';
import { useAuthStore } from '@/stores/auth';
import type { ZmEvent } from '@/types';
import { formatStats, maxScoreFrame, type StatsRow } from './statsTable';

export interface FrameStatsState {
  rows: StatsRow[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
}

/**
 * One frame's per-zone stats, formatted as legacy's stats table prints them.
 * Zone names and areas come from the event's monitor; the percentages are
 * against the event's own width × height (legacy joins the monitor's, which
 * is what the event was recorded at).
 *
 * `decimals` is 0 for the stats page and the frames "+" row
 * (`getStatsTableHTML`) and 1 for the frame view (`ajax/stats.php` raw).
 */
export function useFrameStats(
  event: Pick<ZmEvent, 'id' | 'monitor_id' | 'width' | 'height'> | undefined,
  frameId: number | null | undefined,
  decimals = 0,
): FrameStatsState {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const monitorId = event?.monitor_id ?? 0;

  const zonesQ = useQuery({
    queryKey: ['zones', monitorId],
    queryFn: () => listZonesForMonitor(monitorId, { page: 1, page_size: 100 }),
    enabled: isAuthenticated && monitorId > 0,
    staleTime: 60_000,
  });

  const statsQ = useQuery({
    queryKey: ['stats', event?.id, frameId],
    // One row per zone, so a page of 100 is every row a frame can have.
    queryFn: () => listStats({ event_id: event!.id, frame_id: frameId!, page: 1, page_size: 100 }),
    enabled: isAuthenticated && !!event && frameId != null && frameId > 0,
  });

  const rows = useMemo(
    () => formatStats(
      statsQ.data?.items ?? [],
      zonesQ.data?.items ?? [],
      event?.width ?? 0,
      event?.height ?? 0,
      decimals,
    ),
    [statsQ.data, zonesQ.data, event?.width, event?.height, decimals],
  );

  return {
    rows,
    isLoading: statsQ.isLoading || zonesQ.isLoading,
    isError: statsQ.isError,
    error: statsQ.error,
    refetch: () => { void statsQ.refetch(); void zonesQ.refetch(); },
  };
}

/**
 * Every frame of an event, shared with the scrubber's cache — the frame view
 * walks it for First / Prev / Next / Last and both pages take the max-score
 * frame from it.
 */
export function useEventFrames(eventId: number) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const q = useQuery({
    queryKey: ['eventFrames', eventId],
    queryFn: () => getAllFramesForEvent(eventId),
    enabled: isAuthenticated && eventId > 0,
  });
  const frames: Frame[] = useMemo(() => q.data ?? [], [q.data]);
  const maxFrame = useMemo(() => maxScoreFrame(frames), [frames]);
  return { frames, maxFrame, isLoading: q.isLoading, isError: q.isError, error: q.error, refetch: q.refetch };
}

import { useQuery } from '@tanstack/react-query';

import { getEvent } from '@/api/events';
import { useAuthStore } from '@/stores/auth';
import type { ZmEvent } from '@/types';
import type { StatsRow } from './statsTable';
import { useEventFrames, useFrameStats } from './useFrameStats';

export interface EventStatsPageState {
  isAuthenticated: boolean;
  event: ZmEvent | undefined;
  /** The frame the table is for: `?fid=`, or the max-score frame without one. */
  frameId: number | null;
  rows: StatsRow[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
}

/**
 * Legacy `?view=stats&eid=&fid=`: one frame's per-zone motion stats. Without
 * a frame id legacy prints an empty table; here it opens the frame with the
 * highest score instead, which is the one an operator arriving from the
 * event's Max score is after (zm-api#176 will name it directly).
 */
export function useEventStatsPage(eventId: number, fid?: number): EventStatsPageState {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const eventQ = useQuery({
    queryKey: ['event', eventId],
    queryFn: () => getEvent(eventId),
    enabled: isAuthenticated && eventId > 0,
  });
  const needsMax = !(fid && fid > 0);
  const frames = useEventFrames(needsMax ? eventId : 0);
  const frameId = needsMax ? (frames.maxFrame?.frame_id ?? null) : fid!;
  const stats = useFrameStats(eventQ.data, frameId);

  return {
    isAuthenticated,
    event: eventQ.data,
    frameId,
    rows: stats.rows,
    isLoading: eventQ.isLoading || (needsMax && frames.isLoading) || (frameId != null && stats.isLoading),
    isError: eventQ.isError || stats.isError,
    error: eventQ.error ?? stats.error,
    refetch: () => { void eventQ.refetch(); stats.refetch(); },
  };
}

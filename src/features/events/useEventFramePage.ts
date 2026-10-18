import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

import { getEvent } from '@/api/events';
import { getEventFrameImageUrl, getFrameImageUrl, type Frame } from '@/api/frames';
import { getMonitor } from '@/api/monitors';
import { useAuthStore } from '@/stores/auth';
import {
  useEventPlaybackStore, isPlaybackScale, scaleToMaxWidth, type PlaybackScale,
} from '@/stores/eventPlayback';
import type { ZmEvent } from '@/types';
import { frameNeighbours, type FrameNeighbours, type StatsRow } from './statsTable';
import { useEventFrames, useFrameStats } from './useFrameStats';

export interface EventFramePageState {
  isAuthenticated: boolean;
  event: ZmEvent | undefined;
  /** The frame on screen; `0` in the URL resolves to the max-score frame. */
  frameId: number | null;
  /** Its `/frames` row, or null when the event has no row for that number. */
  frame: Frame | null;
  /** Legacy shows a missing row as a Normal frame with score 0. */
  score: number;
  imageUrl: string | null;
  neighbours: FrameNeighbours;
  goToFrame: (frameId: number | null) => void;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;

  /** The frame's per-zone stats, one decimal on the shares (`ajax/stats.php` raw). */
  stats: StatsRow[];
  statsLoading: boolean;
  showStats: boolean;
  setShowStats: (v: boolean) => void;

  scale: PlaybackScale;
  setScale: (s: PlaybackScale) => void;
  imageMaxWidth: string | undefined;
}

/**
 * Legacy `?view=frame&eid=&fid=`: one frame's JPEG with First / Prev / Next /
 * Last under it and its stats beside it. `fid=0` is legacy's "the frame with
 * the max score"; until zm-api#176 reports that frame it is picked from the
 * event's `/frames`.
 */
export function useEventFramePage(eventId: number, requestedFrameId: number): EventFramePageState {
  const { isAuthenticated, accessToken } = useAuthStore();
  const navigate = useNavigate();
  const {
    showFrameStats, setShowFrameStats, scaleByMonitor, setScale: setMonitorScale,
  } = useEventPlaybackStore();

  const eventQ = useQuery({
    queryKey: ['event', eventId],
    queryFn: () => getEvent(eventId),
    enabled: isAuthenticated && eventId > 0,
  });
  const event = eventQ.data;
  const { data: monitor } = useQuery({
    queryKey: ['monitor', event?.monitor_id],
    queryFn: () => getMonitor(event!.monitor_id),
    enabled: isAuthenticated && !!event?.monitor_id,
  });

  const framesQ = useEventFrames(eventId);
  const frameId = requestedFrameId > 0 ? requestedFrameId : (framesQ.maxFrame?.frame_id ?? null);
  const frame = frameId != null ? (framesQ.frames.find((f) => f.frame_id === frameId) ?? null) : null;
  const imageUrl = frame
    ? getFrameImageUrl(frame.id, accessToken)
    : frameId != null ? getEventFrameImageUrl(eventId, frameId, accessToken) : null;
  const neighbours = frameNeighbours(framesQ.frames, frameId ?? 0, event?.frames);

  const stats = useFrameStats(event, frameId, 1);

  const monitorDefault: PlaybackScale = isPlaybackScale(monitor?.default_scale) ? monitor.default_scale : '0';
  const scale: PlaybackScale = (event ? scaleByMonitor[event.monitor_id] : undefined) ?? monitorDefault;

  return {
    isAuthenticated,
    event,
    frameId,
    frame,
    score: frame?.score ?? 0,
    imageUrl,
    neighbours,
    goToFrame: (fid) => {
      if (fid == null) return;
      navigate({
        to: '/events/$eventId/frames/$frameId',
        params: { eventId: String(eventId), frameId: String(fid) },
      });
    },
    isLoading: eventQ.isLoading || framesQ.isLoading,
    isError: eventQ.isError || framesQ.isError,
    error: eventQ.error ?? framesQ.error,
    refetch: () => { void eventQ.refetch(); void framesQ.refetch(); stats.refetch(); },

    stats: stats.rows,
    statsLoading: stats.isLoading,
    showStats: showFrameStats,
    setShowStats: setShowFrameStats,

    scale,
    setScale: (s) => { if (event) setMonitorScale(event.monitor_id, s); },
    imageMaxWidth: event ? scaleToMaxWidth(scale, event.width || 0, event.height || 0) : undefined,
  };
}

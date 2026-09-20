import { useQueries } from '@tanstack/react-query';
import { listFrames, type Frame } from '@/api/frames';
import { useAuthStore } from '@/stores/auth';
import type { ZmEvent } from '@/types';

/**
 * How many events in the window get their frames fetched. Legacy asks for
 * every event's frames and chokes on a busy day; one request per event is
 * expensive enough that the timeline only shades the events most worth
 * shading (highest score first) and leaves the rest as plain bars.
 */
export const FRAME_SCORE_EVENT_LIMIT = 20;
/** One page is enough to shade a bar; events rarely exceed this many frames. */
export const FRAME_SCORE_PAGE_SIZE = 500;

/** The scored events worth fetching frames for, highest score first. */
export function frameScoreTargets(events: ZmEvent[], limit = FRAME_SCORE_EVENT_LIMIT): ZmEvent[] {
  return events
    .filter((e) => (e.alarm_frames ?? 0) > 0 && (e.max_score ?? 0) > 0)
    .slice()
    .sort((a, b) => (b.max_score ?? 0) - (a.max_score ?? 0))
    .slice(0, limit);
}

/**
 * Legacy `drawFrameOnGraph`'s alpha: `0.4 + 0.6 × (1 − Score/maxScore)`.
 * Counter-intuitive but faithful — the hottest frame is the *lightest*, and
 * even the coldest scored frame is twice as opaque as the event bar behind it.
 */
export function frameAlpha(score: number, maxScore: number): number {
  if (!(maxScore > 0)) return 1;
  return 0.4 + 0.6 * (1 - Math.min(score, maxScore) / maxScore);
}

/**
 * Alarm frames for the events on screen, keyed by event id. Cached per event,
 * so panning back over a window costs nothing.
 */
export function useFrameScores(
  events: ZmEvent[],
  enabled = true,
): { framesByEvent: Map<number, Frame[]>; maxScore: number } {
  const { isAuthenticated } = useAuthStore();
  const targets = frameScoreTargets(events);

  const results = useQueries({
    queries: targets.map((e) => ({
      queryKey: ['reviewFrames', e.id] as const,
      queryFn: () => listFrames({ event_id: e.id, page: 1, page_size: FRAME_SCORE_PAGE_SIZE }),
      enabled: enabled && isAuthenticated,
      staleTime: 5 * 60_000,
    })),
  });

  const framesByEvent = new Map<number, Frame[]>();
  targets.forEach((e, i) => {
    const rows = results[i]?.data?.items;
    if (rows) framesByEvent.set(e.id, rows.filter((f) => (f.score ?? 0) > 0));
  });
  const maxScore = events.reduce((max, e) => Math.max(max, e.max_score ?? 0), 0);
  return { framesByEvent, maxScore };
}

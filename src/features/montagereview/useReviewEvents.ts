import { useQuery } from '@tanstack/react-query';
import { getEvents } from '@/api/events';
import { useAuthStore } from '@/stores/auth';
import type { ZmEvent } from '@/types';

/**
 * Events recorded for one monitor within a time range, sorted ascending by
 * start time. Cached per (monitor, range) so the Review page doesn't re-fetch
 * every time the playhead moves.
 */
export function useReviewEvents(
  monitorId: number,
  rangeStart: Date,
  rangeEnd: Date,
): { events: ZmEvent[]; isLoading: boolean } {
  const { isAuthenticated } = useAuthStore();
  const startISO = rangeStart.toISOString();
  const endISO = rangeEnd.toISOString();

  const q = useQuery({
    queryKey: ['reviewEvents', monitorId, startISO, endISO],
    queryFn: () => getEvents({
      monitor_id: monitorId,
      start_date: startISO,
      end_date: endISO,
      page: 1,
      page_size: 500,
    }),
    enabled: isAuthenticated && !isNaN(monitorId),
    staleTime: 30_000,
  });

  const events = (q.data?.items ?? []).slice().sort((a, b) => {
    const at = a.start_date_time ? Date.parse(a.start_date_time) : 0;
    const bt = b.start_date_time ? Date.parse(b.start_date_time) : 0;
    return at - bt;
  });

  return { events, isLoading: q.isLoading };
}

/**
 * Find the event whose span contains the given time, if any. Used by each
 * Review cell to pick which event's video to render right now.
 */
export function findEventAt(events: ZmEvent[], when: Date): ZmEvent | null {
  const t = when.getTime();
  for (const e of events) {
    if (!e.start_date_time) continue;
    const start = Date.parse(e.start_date_time);
    if (isNaN(start)) continue;
    // Fall back to a 10-minute window if end is missing (event still
    // recording).
    const end = e.end_date_time
      ? Date.parse(e.end_date_time)
      : start + 10 * 60 * 1000;
    if (t >= start && t < end) return e;
  }
  return null;
}

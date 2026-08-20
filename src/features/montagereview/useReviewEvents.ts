import { useQuery } from '@tanstack/react-query';
import { getEvents, type EventQueryParams } from '@/api/events';
import { useAuthStore } from '@/stores/auth';
import type { ZmEvent } from '@/types';

/** Backend cap is 1000 per page; 500 keeps each page under ~2.5 MB. */
export const REVIEW_PAGE_SIZE = 500;
/** Hard stop so a runaway window cannot pull a box's whole history. */
export const REVIEW_MAX_PAGES = 40;

/**
 * Every event for one monitor in the window, oldest first, following the
 * pagination until the last page. The server sorts (`sort=start_time`), so
 * paging is stable while new events land at the far end.
 *
 * Timestamps are used as the API returns them. The dev box (old build) stamps
 * server-local `DATETIME`s with `Z`; the 12-legacy-upgrade-bridge build sends
 * true UTC. Windows computed here are UTC, so on the old build a window can
 * look shifted by the server's UTC offset — a backend fix, not ours.
 */
export async function fetchReviewEvents(
  monitorId: number,
  startISO: string,
  endISO: string,
): Promise<ZmEvent[]> {
  const out: ZmEvent[] = [];
  for (let page = 1; page <= REVIEW_MAX_PAGES; page++) {
    const res = await getEvents({
      monitor_id: monitorId,
      start_time: startISO,
      end_time: endISO,
      page,
      page_size: REVIEW_PAGE_SIZE,
      // `start_time` is the backend's sort key name (its docs list start_time,
      // end_time, alarm_frames, max_score, avg_score, tot_score, length, id).
      sort: 'start_time',
      direction: 'asc',
    } as EventQueryParams);
    out.push(...res.items);
    if (res.items.length === 0 || res.current_page >= res.last_page) break;
  }
  return out;
}

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
    queryFn: () => fetchReviewEvents(monitorId, startISO, endISO),
    enabled: isAuthenticated && !isNaN(monitorId),
    staleTime: 30_000,
  });

  return { events: q.data ?? [], isLoading: q.isLoading };
}

/**
 * When an event ends, in ms. An event with no `end_date_time` is still being
 * recorded, so it runs up to `now` — the one rule both the timeline bars and
 * the per-cell lookup use.
 */
export function eventEndMs(event: ZmEvent, nowMs: number = Date.now()): number | null {
  if (!event.start_date_time) return null;
  const start = Date.parse(event.start_date_time);
  if (isNaN(start)) return null;
  if (event.end_date_time) {
    const end = Date.parse(event.end_date_time);
    return isNaN(end) ? start : Math.max(start, end);
  }
  return Math.max(start, nowMs);
}

/**
 * Find the event whose span contains the given time, if any. Used by each
 * Review cell to pick which event's video to render right now.
 */
export function findEventAt(events: ZmEvent[], when: Date, nowMs: number = Date.now()): ZmEvent | null {
  const t = when.getTime();
  for (const e of events) {
    if (!e.start_date_time) continue;
    const start = Date.parse(e.start_date_time);
    if (isNaN(start)) continue;
    const end = eventEndMs(e, nowMs) ?? start;
    if (t >= start && t < end) return e;
  }
  return null;
}

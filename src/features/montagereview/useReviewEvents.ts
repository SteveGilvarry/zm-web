import { useQuery } from '@tanstack/react-query';
import { getEvents, type EventQueryParams } from '@/api/events';
import { useAuthStore } from '@/stores/auth';
import type { ZmEvent } from '@/types';

/** Backend cap is 1000 per page; 500 keeps each page under ~2.5 MB. */
export const REVIEW_PAGE_SIZE = 500;
/** Hard stop so a runaway window cannot pull a box's whole history. */
export const REVIEW_MAX_PAGES = 40;

/** Legacy montage-review event filters: Archived, Tags, Notes. */
export interface ReviewEventFilters {
  /** Legacy Archive Status select. */
  archived: 'all' | 'unarchived' | 'archived';
  /** Any-of tag ids (`tag_id=1,2`). */
  tagIds: number[];
  /** Substring of the event notes (legacy's LIKE match). */
  notes: string;
}

export const DEFAULT_REVIEW_FILTERS: ReviewEventFilters = {
  archived: 'all',
  tagIds: [],
  notes: '',
};

/** The filter half of the events query — also the cache key's filter part. */
function filterParams(filters: ReviewEventFilters): Partial<EventQueryParams> {
  return {
    ...(filters.archived === 'all' ? {} : { archived: filters.archived === 'archived' }),
    ...(filters.tagIds.length > 0 ? { tag_id: filters.tagIds.join(',') } : {}),
    ...(filters.notes.trim() ? { notes: filters.notes.trim() } : {}),
  };
}

/**
 * Every event for one monitor in the window, oldest first, following the
 * pagination until the last page. The server sorts (`sort=start_time`), so
 * paging is stable while new events land at the far end.
 *
 * Timestamps are true UTC (zm-api#16), so the windows computed here line up
 * with what the operator sees.
 */
export async function fetchReviewEvents(
  monitorId: number,
  startISO: string,
  endISO: string,
  filters: ReviewEventFilters = DEFAULT_REVIEW_FILTERS,
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
      ...filterParams(filters),
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
  filters: ReviewEventFilters = DEFAULT_REVIEW_FILTERS,
): { events: ZmEvent[]; isLoading: boolean } {
  const { isAuthenticated } = useAuthStore();
  const startISO = rangeStart.toISOString();
  const endISO = rangeEnd.toISOString();

  const q = useQuery({
    queryKey: ['reviewEvents', monitorId, startISO, endISO, filterParams(filters)],
    queryFn: () => fetchReviewEvents(monitorId, startISO, endISO, filters),
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

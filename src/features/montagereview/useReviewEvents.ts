import { useQuery } from '@tanstack/react-query';
import { getEvents, TAG_ANY, TAG_NONE, type EventQueryParams } from '@/api/events';
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
  /**
   * Legacy's Tags multi-select, values as legacy stores them: tag ids, plus
   * `0` for No Tag and `-1` for Any Tag. Empty = every event.
   */
  tagIds: number[];
  /** Legacy's Notes multi-select: event types, each a LIKE match, ORed. */
  notes: string[];
}

/** Legacy's special Tags values. */
export const REVIEW_NO_TAG = 0;
export const REVIEW_ANY_TAG = -1;

export const DEFAULT_REVIEW_FILTERS: ReviewEventFilters = {
  archived: 'all',
  tagIds: [],
  notes: [],
};

/**
 * The `tag_id` values legacy's Tags selection asks for, one request each
 * (the union is the answer); `null` means no tag filter. zm-api takes `none`,
 * `any` or an id list, never a mix, so No Tag plus some tags is two requests.
 */
export function reviewTagQueries(tagIds: number[]): Array<string | null> {
  const none = tagIds.includes(REVIEW_NO_TAG);
  const any = tagIds.includes(REVIEW_ANY_TAG);
  const ids = tagIds.filter((id) => id > 0).join(',');
  if (none && any) return [null]; // tagged or not: every event
  if (any) return [TAG_ANY]; // any listed tag is already "any tag"
  if (none) return ids ? [TAG_NONE, ids] : [TAG_NONE];
  return ids ? [ids] : [null];
}

/**
 * The filter half of the events query, as the list of requests whose union
 * is the answer: one per Notes pick (legacy ORs them; `/events` takes one
 * `notes` substring) times one per tag query. Also the cache key's filter part.
 */
export function reviewFilterQueries(filters: ReviewEventFilters): Array<Partial<EventQueryParams>> {
  const archived = filters.archived === 'all' ? {} : { archived: filters.archived === 'archived' };
  const notes = filters.notes.map((n) => n.trim()).filter(Boolean);
  const out: Array<Partial<EventQueryParams>> = [];
  for (const note of notes.length > 0 ? notes : [null]) {
    for (const tag of reviewTagQueries(filters.tagIds)) {
      out.push({
        ...archived,
        ...(tag ? { tag_id: tag, tag_op: 'in' as const } : {}),
        ...(note ? { notes: note } : {}),
      });
    }
  }
  return out;
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
  const queries = reviewFilterQueries(filters);
  const byId = new Map<number, ZmEvent>();
  for (const query of queries) {
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
        ...query,
      });
      for (const event of res.items) byId.set(event.id, event);
      if (res.items.length === 0 || res.current_page >= res.last_page) break;
    }
  }
  const out = [...byId.values()];
  // One request comes back sorted; a union has to be put back in order.
  if (queries.length > 1) {
    out.sort((a, b) => Date.parse(a.start_date_time ?? '') - Date.parse(b.start_date_time ?? '') || a.id - b.id);
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
    queryKey: ['reviewEvents', monitorId, startISO, endISO, reviewFilterQueries(filters)],
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

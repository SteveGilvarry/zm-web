import { parseEventsSearch, type EventNavSearch, type EventsSearchParams } from '@/features/events/eventsSearch';
import { phpDate, type WindowRequest } from './timelineChart';

/**
 * `/timeline`'s URL: the events list's filter (so the Events toolbar's
 * Timeline link and the List button here round-trip it, as legacy's
 * `filterQuery` does) plus legacy's own window keys — `minTime`, `maxTime`,
 * `midTime`, `range` — as `min_time`, `max_time`, `mid_time`, `range`.
 * The list's page is dropped: the timeline changes the set.
 */
export type TimelineSearchParams = Omit<EventsSearchParams, 'page'> & WindowRequest;

const WINDOW_KEYS = ['min_time', 'max_time', 'mid_time', 'range'] as const;

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined;
}

/** `validateSearch` for `/timeline/`: anything malformed is dropped. */
export function parseTimelineSearch(search: Record<string, unknown>): TimelineSearchParams {
  const out: TimelineSearchParams = parseEventsSearch(search);
  delete (out as EventsSearchParams).page;
  const range = typeof search.range === 'number' ? search.range : Number(str(search.range) ?? NaN);
  const extra: WindowRequest = {
    min_time: str(search.min_time),
    max_time: str(search.max_time),
    mid_time: str(search.mid_time),
    range: Number.isInteger(range) && range > 0 ? range : undefined,
  };
  for (const k of WINDOW_KEYS) if (extra[k] !== undefined) (out as Record<string, unknown>)[k] = extra[k];
  return out;
}

/** The events filter alone, without the timeline's window. */
export function filterOf(s: TimelineSearchParams): Omit<EventsSearchParams, 'page'> {
  const out = { ...s } as Record<string, unknown>;
  for (const k of WINDOW_KEYS) delete out[k];
  return out as Omit<EventsSearchParams, 'page'>;
}

/** `datetime-local` style, which the events list's Start/End boxes read. */
export function toLocalInput(seconds: number): string {
  return phpDate('Y-m-d', seconds) + 'T' + phpDate('H:i:s', seconds);
}

/**
 * The List button (`?view=events` + `filterQuery`): the same filter, with
 * the chart's window appended as Start ≥ / Start ≤, as `appendDatetimeRange`
 * does before legacy builds `filterQuery`.
 */
export function eventsLinkSearch(s: TimelineSearchParams, lo: number, hi: number): EventsSearchParams {
  return { ...filterOf(s), start: toLocalInput(lo), end: toLocalInput(hi) };
}

/** What a click-through to `/events/$eventId` carries, so Prev/Next walk the same set. */
export function eventNavSearch(s: TimelineSearchParams): EventNavSearch {
  const out = { ...filterOf(s) } as EventsSearchParams;
  delete out.group;
  return out;
}

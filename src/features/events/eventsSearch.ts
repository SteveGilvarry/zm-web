import { isEventSortField, type EventSortField, type SortDirection } from '@/api/events';
import type { FilterTerm } from '@/api/filters';

/**
 * Everything the Events list keeps in the URL, so back/forward, reload and
 * shared links land on the same page of the same set. Legacy kept the same
 * state in `filter[Query][terms][…]` + `page`; ours is flat.
 */
export interface EventsSearchParams {
  /**
   * One monitor id, or several (legacy's strip Monitor box is a
   * multi-select). A single id serialises as a bare number so old links
   * keep working; see `monitorIdsFromSearch`.
   */
  monitor_id?: number | number[];
  /** Group filter — resolved to its monitors via `/groups-monitors`. */
  group?: number;
  /** One storage area, as the Storage list's Events link sets it. */
  storage?: number;
  /** Substring match on Cause (the API's `cause` param). */
  cause?: string;
  archived?: boolean;
  /** Start ≥, `YYYY-MM-DDTHH:MM[:SS]` local wall clock or a full ISO stamp. */
  start?: string;
  /** Start ≤ (sent as the API's `end_time` bound, see `useEventsListPage`). */
  end?: string;
  /** Substring match on Notes (the API's `notes` param). */
  notes?: string;
  tag?: number;
  /** Substring match on Name (the API's `name` param). */
  q?: string;
  page?: number;
  page_size?: number;
  sort?: EventSortField;
  dir?: SortDirection;
}

function int(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/** `4`, `'4'`, `'4,7'` or `[4, 7]` → `[4, 7]`; malformed entries are dropped. */
function intList(v: unknown): number[] {
  const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [v];
  return Array.from(new Set(raw.map(int).filter((n): n is number => n !== undefined)));
}

/** The monitor filter as a list, empty for "all monitors". */
export function monitorIdsFromSearch(s: Pick<EventsSearchParams, 'monitor_id'>): number[] {
  return intList(s.monitor_id);
}

/** The inverse: a list as the URL value — bare number for one id, nothing for none. */
export function monitorIdsToSearch(ids: number[]): number | number[] | undefined {
  if (ids.length === 0) return undefined;
  return ids.length === 1 ? ids[0] : ids;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined;
}

function bool(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return undefined;
}

/** `validateSearch` for `/events/`: anything malformed is dropped, never thrown. */
export function parseEventsSearch(search: Record<string, unknown>): EventsSearchParams {
  const out: EventsSearchParams = {
    monitor_id: monitorIdsToSearch(intList(search.monitor_id)),
    group: int(search.group),
    storage: int(search.storage),
    cause: str(search.cause),
    archived: bool(search.archived),
    start: str(search.start),
    end: str(search.end),
    notes: str(search.notes),
    tag: int(search.tag),
    q: str(search.q),
    page: int(search.page),
    page_size: int(search.page_size),
    sort: isEventSortField(search.sort) ? search.sort : undefined,
    dir: search.dir === 'asc' || search.dir === 'desc' ? search.dir : undefined,
  };
  // Keep the object free of `undefined` so it serialises to a clean URL.
  for (const k of Object.keys(out) as (keyof EventsSearchParams)[]) {
    if (out[k] === undefined) delete out[k];
  }
  return out;
}

/** `2026-08-21T06:37` / `2026-08-21T06:37:03` → ZoneMinder's `2026-08-21 06:37:03`. */
export function toZmDateTime(local: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(local);
  if (!m) return local;
  return `${m[1]} ${m[2]}:${m[3]}:${m[4] ?? '00'}`;
}

/**
 * The ad-hoc list filters as ZoneMinder filter terms, so the "Filter"
 * button can hand them to a new saved filter. Every list filter maps onto
 * an attribute `zmfilter.pl` understands, so nothing is dropped.
 */
export function termsFromEventsSearch(s: EventsSearchParams): FilterTerm[] {
  const terms: FilterTerm[] = [];
  const push = (attr: string, op: FilterTerm['op'], val: string) =>
    terms.push({ cnj: terms.length ? 'and' : undefined, obr: '0', attr, op, val, cbr: '0' });
  const monitorIds = monitorIdsFromSearch(s);
  if (monitorIds.length === 1) push('MonitorId', '=', String(monitorIds[0]));
  else if (monitorIds.length > 1) push('MonitorId', '=[]', monitorIds.join(','));
  if (s.group != null) push('Group', '=', String(s.group));
  if (s.storage != null) push('StorageId', '=', String(s.storage));
  if (s.start) push('StartDateTime', '>=', toZmDateTime(s.start));
  if (s.end) push('StartDateTime', '<=', toZmDateTime(s.end));
  if (s.cause) push('Cause', 'LIKE', s.cause);
  if (s.notes) push('Notes', 'LIKE', s.notes);
  if (s.q) push('Name', 'LIKE', s.q);
  if (s.tag != null) push('Tags', '=', String(s.tag));
  if (s.archived !== undefined) push('Archived', '=', s.archived ? '1' : '0');
  // First term carries no conjunction (ZoneMinder's shape).
  if (terms[0]) delete terms[0].cnj;
  return terms;
}

/**
 * What the list puts on its links to `/events/$eventId`, so Prev / Next
 * there walk the set the operator was looking at, in its order (legacy
 * carries `filterQuery` + `sortQuery` the same way). Same shape as the list's
 * own URL minus `group`, which `/events` cannot filter by.
 */
export type EventNavSearch = Omit<EventsSearchParams, 'group'>;

/** `validateSearch` for `/events/$eventId`. */
export function parseEventNavSearch(search: Record<string, unknown>): EventNavSearch {
  const out = parseEventsSearch(search);
  delete out.group;
  return out;
}

/**
 * A date/time filter value as the full ISO timestamp zm-api's strict parser
 * wants. Accepts what the list's two input types emit — `YYYY-MM-DD` (local
 * midnight) and `YYYY-MM-DDTHH:MM[:SS]` (local wall clock) — and passes a
 * value that already carries `Z` or an offset straight through.
 */
export function toApiTimestamp(value: string): string {
  if (!value) return '';
  if (/(Z|[+-]\d{2}:\d{2})$/.test(value)) return value;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00` : value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

import { isEventSortField, type EventSortField, type SortDirection } from '@/api/events';
import type { FilterTerm } from '@/api/filters';
import { tagPickFromOption, tagPicksToTermValue, type TagPick } from './tagFilter';

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
  /**
   * Group filter — resolved to its monitors via `/groups-monitors`. Legacy's
   * Group box is a multi-select (Filter.php:1307); one id serialises bare.
   */
  group?: number | number[];
  /** One storage area, as the Storage list's Events link sets it. */
  storage?: number;
  /** Substring match on Cause (the API's `cause` param). */
  cause?: string;
  archived?: boolean;
  /** Start ≥, `YYYY-MM-DDTHH:MM[:SS]` local wall clock or a full ISO stamp. */
  start?: string;
  /** Start ≤ (sent as the API's `end_time` bound, see `useEventsListPage`). */
  end?: string;
  /**
   * Event types to match on Notes. Legacy's strip Notes box is a fixed
   * multi-select (`Motion`, `ONVIF`, `detected`, …) whose picks are ORed as
   * `Notes LIKE %value%`; one value serialises as a bare string so old
   * links keep working. See `notesFromSearch`.
   */
  notes?: string | string[];
  /**
   * Tags box picks: tag ids, `none` (legacy's No Tag) or `any` (Any Tag).
   * A multi-select like legacy's; one pick serialises bare, so `tag=4`
   * links keep working. See `tagsFromSearch`.
   */
  tag?: TagPick | TagPick[];
  /** Substring match on Name (the API's `name` param). */
  q?: string;
  /**
   * A full ZoneMinder term list, JSON-encoded — what the filter editor's
   * List Matches sends (legacy `?view=events&filter[Query][terms]…`). It
   * replaces the strip: the list shows exactly these terms.
   */
  terms?: string;
  /** A saved filter whose terms the list shows (legacy `?view=events&filter_id=`). */
  filter_id?: number;
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

/** `'a'`, `'a,b'` or `['a','b']` → `['a','b']`; blanks are dropped. */
function strList(v: unknown): string[] {
  const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [];
  return Array.from(new Set(
    raw.map((x) => (typeof x === 'string' ? x.trim() : '')).filter((x) => x !== ''),
  ));
}

/** The Notes filter as a list of event types; empty means "any note". */
export function notesFromSearch(s: Pick<EventsSearchParams, 'notes'>): string[] {
  return strList(s.notes);
}

/** The inverse: bare string for one type, nothing for none. */
export function notesToSearch(values: string[]): string | string[] | undefined {
  if (values.length === 0) return undefined;
  return values.length === 1 ? values[0] : values;
}

/** The Group filter as a list, empty for "all groups". */
export function groupIdsFromSearch(s: Pick<EventsSearchParams, 'group'>): number[] {
  return intList(s.group);
}

/** The inverse: bare number for one group, nothing for none. */
export const groupIdsToSearch = monitorIdsToSearch;

/**
 * `4`, `'none'`, `'4,any'`, `[4, 'none']` → picks. Legacy's own spellings of
 * the sentinels (`0`, `-1`) are accepted too, so a term value can be passed
 * straight in.
 */
export function tagsFromSearch(s: { tag?: unknown }): TagPick[] {
  const v = s.tag;
  const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : v == null ? [] : [v];
  const picks = raw.map((x) => {
    const str = String(x).trim();
    if (str === '0') return 'none' as const;
    if (str === '-1') return 'any' as const;
    return tagPickFromOption(str);
  }).filter((p): p is TagPick => p !== undefined);
  return Array.from(new Set(picks));
}

/** The inverse: bare value for one pick, nothing for none. */
export function tagsToSearch(picks: TagPick[]): TagPick | TagPick[] | undefined {
  if (picks.length === 0) return undefined;
  return picks.length === 1 ? picks[0] : picks;
}

/**
 * The `terms` param as a term list, or `null` when it is missing or not a
 * list of terms. Accepts the JSON string the app writes and the array the
 * router hands over when it has already parsed that JSON.
 */
export function parseTermsParam(v: unknown): FilterTerm[] | null {
  let parsed: unknown = v;
  if (typeof v === 'string') {
    if (v.trim() === '') return null;
    try { parsed = JSON.parse(v); } catch { return null; }
  }
  if (!Array.isArray(parsed)) return null;
  const ok = parsed.every((t) => t && typeof t === 'object' && typeof (t as FilterTerm).attr === 'string');
  return ok ? (parsed as FilterTerm[]) : null;
}

function termsParamToSearch(v: unknown): string | undefined {
  const terms = parseTermsParam(v);
  return terms ? JSON.stringify(terms) : undefined;
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
    group: groupIdsToSearch(intList(search.group)),
    storage: int(search.storage),
    cause: str(search.cause),
    archived: bool(search.archived),
    start: str(search.start),
    end: str(search.end),
    notes: notesToSearch(strList(search.notes)),
    tag: tagsToSearch(tagsFromSearch(search)),
    q: str(search.q),
    terms: termsParamToSearch(search.terms),
    filter_id: int(search.filter_id),
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
  // A list opened from the filter editor already is a term list.
  const given = parseTermsParam(s.terms);
  if (given) return given;
  const terms: FilterTerm[] = [];
  const push = (attr: string, op: FilterTerm['op'], val: string) =>
    terms.push({ cnj: terms.length ? 'and' : undefined, obr: '0', attr, op, val, cbr: '0' });
  const monitorIds = monitorIdsFromSearch(s);
  if (monitorIds.length === 1) push('MonitorId', '=', String(monitorIds[0]));
  else if (monitorIds.length > 1) push('MonitorId', '=[]', monitorIds.join(','));
  // Multi-selects travel as the comma list `decode_multi` reads back and
  // both executors split on (Filter.php:1171, Filter.pm:330).
  const groups = groupIdsFromSearch(s);
  if (groups.length) push('Group', '=', groups.join(','));
  if (s.storage != null) push('StorageId', '=', String(s.storage));
  if (s.start) push('StartDateTime', '>=', toZmDateTime(s.start));
  if (s.end) push('StartDateTime', '<=', toZmDateTime(s.end));
  if (s.cause) push('Cause', 'LIKE', s.cause);
  // Legacy's Notes box is a multi-select whose value is the comma list its
  // `decode_multi` reads back (Filter.php:1169).
  const notes = notesFromSearch(s);
  if (notes.length) push('Notes', 'LIKE', notes.join(','));
  if (s.q) push('Name', 'LIKE', s.q);
  const tags = tagsFromSearch(s);
  if (tags.length) push('Tags', '=', tagPicksToTermValue(tags));
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
export type EventNavSearch = Omit<EventsSearchParams, 'group' | 'terms' | 'filter_id'> & {
  /** Frame to open at (legacy `?view=event&fid=`): the timeline and Montage Review set it. */
  fid?: number;
};

/** `validateSearch` for `/events/$eventId`. */
export function parseEventNavSearch(search: Record<string, unknown>): EventNavSearch {
  const out = parseEventsSearch(search);
  delete out.group;
  delete out.terms;
  delete out.filter_id;
  const fid = int(search.fid);
  return fid != null ? { ...out, fid } : out;
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

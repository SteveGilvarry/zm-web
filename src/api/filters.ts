import { apiGet, apiPost, apiPut, apiDelete } from './client';
import type { PaginatedResponse, ZmEvent } from '@/types';

/* ------------------------------------------------------------------------ */
/*  Filter row — mirrors FilterResponse (every column of ZM's `Filters`)    */
/* ------------------------------------------------------------------------ */

/**
 * The action / option columns. The backend models each one as a first-class
 * column (ints 0/1 for flags); `query_json` carries only the rule set, sort,
 * limit and skip_locked — exactly what ZoneMinder's PHP UI and `zmfilter.pl`
 * expect. Keep it that way: anything stuffed into `query_json` that ZM does
 * not know about is invisible to the daemon.
 */
export interface FilterColumns {
  auto_archive: number;
  auto_unarchive: number;
  auto_video: number;
  auto_upload: number;
  auto_email: number;
  email_to: string | null;
  email_subject: string | null;
  email_body: string | null;
  email_server: string | null;
  /** `Individual` or `Summary`. */
  email_format: string;
  auto_message: number;
  auto_execute: number;
  auto_execute_cmd: string | null;
  auto_delete: number;
  auto_move: number;
  /** Storage id; 0 = the legacy "Zero" sentinel. */
  auto_move_to: number;
  auto_copy: number;
  auto_copy_to: number;
  update_disk_space: number;
  background: number;
  concurrent: number;
  lock_rows: number;
  /** Seconds between background runs (ZM default 60). */
  execute_interval: number;
  user_id?: number | null;
}

export interface Filter extends FilterColumns {
  id: number;
  name: string;
  /** ZoneMinder's serialised query (see `FilterQuery`). */
  query_json: string;
  /**
   * `query_json` parsed into the backend's structured AST when every term
   * maps to its vocabulary; omitted/null for filters it cannot model (e.g.
   * `PurgeWhenFull`, which uses `DiskPercent`).
   */
  filter?: FilterAstQuery | null;
}

export const FILTER_FLAG_DEFAULTS: FilterColumns = {
  auto_archive: 0,
  auto_unarchive: 0,
  auto_video: 0,
  auto_upload: 0,
  auto_email: 0,
  email_to: '',
  email_subject: '',
  email_body: '',
  email_server: null,
  email_format: 'Individual',
  auto_message: 0,
  auto_execute: 0,
  auto_execute_cmd: '',
  auto_delete: 0,
  auto_move: 0,
  auto_move_to: 0,
  auto_copy: 0,
  auto_copy_to: 0,
  update_disk_space: 0,
  background: 0,
  concurrent: 0,
  lock_rows: 0,
  execute_interval: 60,
};

/* ------------------------------------------------------------------------ */
/*  query_json — ZoneMinder's `terms` shape                                 */
/* ------------------------------------------------------------------------ */

/**
 * Attribute names from legacy `Filter::attrTypes()` (43). Everything here is
 * understood by `zmfilter.pl`; only a subset is modelled by the backend's
 * preview AST (see `src/features/filters/attrs.ts`).
 */
export const FILTER_ATTRS = [
  'AlarmFrames', 'AlarmedZoneId', 'Archived', 'AvgScore', 'Cause',
  'DiskBlocks', 'DiskPercent', 'DiskSpace',
  'CurrentDateTime', 'CurrentDate', 'CurrentTime', 'CurrentWeekday',
  'DateTime', 'Emailed', 'EndDateTime', 'EndDate', 'EndTime', 'EndWeekday',
  'ExistsInFileSystem', 'FilterServerId', 'Frames', 'Group', 'Id', 'Length',
  'MaxScore', 'Monitor', 'MonitorId', 'MonitorName', 'MonitorServerId',
  'Name', 'Notes', 'SecondaryStorageId', 'ServerId',
  'StartDateTime', 'StartDate', 'StartTime', 'StartWeekday',
  'StateId', 'StorageId', 'StorageServerId', 'SystemLoad', 'Tags', 'TotScore',
] as const;
export type FilterAttr = (typeof FILTER_ATTRS)[number];

/** Operators from legacy `Filter::opTypes()` (14). Wire tokens verbatim. */
export const FILTER_OPS = [
  '=', '!=', '>=', '>', '<', '<=', '=~', '!~', '=[]', '![]',
  'IS', 'IS NOT', 'LIKE', 'NOT LIKE',
] as const;
export type FilterOp = (typeof FILTER_OPS)[number];

/** Legacy `$sort_fields` (16; '' = None). */
export const FILTER_SORT_FIELDS = [
  '', 'Id', 'Name', 'Cause', 'Tags', 'DiskSpace', 'Notes', 'MonitorName',
  'StartDateTime', 'EndDateTime', 'Length', 'Frames', 'AlarmFrames',
  'TotScore', 'AvgScore', 'MaxScore',
] as const;
export type FilterSortField = (typeof FILTER_SORT_FIELDS)[number];

export type FilterConjunction = 'and' | 'or';

/**
 * One rule. Field names and value types are ZoneMinder's: everything is a
 * string, brackets are counts serialised as strings ("0", "1", …), the first
 * term carries no `cnj`. Unknown properties are kept so a round-trip never
 * drops what another client wrote.
 */
export interface FilterTerm {
  cnj?: FilterConjunction;
  obr?: string;
  attr: string;
  op: FilterOp;
  val: string;
  cbr?: string;
  [extra: string]: unknown;
}

export interface FilterQuery {
  terms: FilterTerm[];
  sort_field?: string;
  /** "1" = ascending, "0" = descending. */
  sort_asc?: string;
  /** Row cap as a string; "0" / absent = unlimited. */
  limit?: string;
  skip_locked?: string;
  [extra: string]: unknown;
}

export type FilterQueryParse =
  | { ok: true; query: FilterQuery }
  | { ok: false; raw: string; reason: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Parse `query_json` without normalising it. Anything that is not ZM's
 * `terms` shape is reported as unreadable so the editor can refuse to
 * overwrite it — a naive "treat as empty" would turn `PurgeWhenFull` into
 * "delete every event" on the next save.
 *
 * Accepted as empty: null / "" / "{}" (the backend stores "" for a filter
 * created without a query).
 */
export function parseFilterQuery(s: string | null | undefined): FilterQueryParse {
  const raw = s ?? '';
  if (raw.trim() === '') return { ok: true, query: { terms: [] } };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, raw, reason: 'not valid JSON' };
  }
  if (!isRecord(parsed)) return { ok: false, raw, reason: 'not a JSON object' };

  if (!('terms' in parsed)) {
    if (Object.keys(parsed).length === 0) return { ok: true, query: { terms: [] } };
    return { ok: false, raw, reason: 'no "terms" array' };
  }
  const terms = parsed.terms;
  if (!Array.isArray(terms)) return { ok: false, raw, reason: '"terms" is not an array' };

  for (let i = 0; i < terms.length; i++) {
    const t: unknown = terms[i];
    if (!isRecord(t)) return { ok: false, raw, reason: `term ${i + 1} is not an object` };
    if (typeof t.attr !== 'string') return { ok: false, raw, reason: `term ${i + 1} has no "attr"` };
    if (!(FILTER_OPS as readonly string[]).includes(String(t.op))) {
      return { ok: false, raw, reason: `term ${i + 1} has unknown operator "${String(t.op)}"` };
    }
    if (t.val != null && typeof t.val !== 'string' && typeof t.val !== 'number') {
      return { ok: false, raw, reason: `term ${i + 1} has a non-scalar "val"` };
    }
    if (t.cnj != null && t.cnj !== 'and' && t.cnj !== 'or') {
      return { ok: false, raw, reason: `term ${i + 1} has unknown conjunction "${String(t.cnj)}"` };
    }
  }
  return { ok: true, query: parsed as FilterQuery };
}

/**
 * Serialise back to ZoneMinder's format. `JSON.stringify` of the parsed
 * object reproduces the input byte-for-byte for anything ZM wrote (no
 * whitespace, key order preserved), so parse→serialise is lossless.
 */
export function serializeFilterQuery(q: FilterQuery): string {
  return JSON.stringify(q);
}

/* ------------------------------------------------------------------------ */
/*  Structured AST — the backend's `FilterQuery` for /filters/preview       */
/* ------------------------------------------------------------------------ */

export type FilterAstField =
  | 'id' | 'monitor_id' | 'name' | 'cause' | 'notes' | 'start_time' | 'end_time'
  | 'length' | 'frames' | 'alarm_frames' | 'tot_score' | 'avg_score' | 'max_score'
  | 'archived' | 'videoed' | 'uploaded' | 'emailed' | 'messaged' | 'executed'
  | 'locked' | 'state_id' | 'storage_id' | 'disk_space' | 'width' | 'height'
  | 'monitor_name';

export type FilterAstOp =
  | 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'not_like'
  | 'in' | 'not_in' | 'is_null' | 'is_not_null' | 'regexp' | 'not_regexp';

export type FilterAstValue = string | number | boolean | Array<string | number>;

export type FilterAstExpr =
  | { match: 'all' | 'any'; rules: FilterAstExpr[] }
  | { field: FilterAstField; op: FilterAstOp; value?: FilterAstValue };

export interface FilterAstQuery {
  where: FilterAstExpr;
  sort?: { field: FilterAstField; dir: 'asc' | 'desc' } | null;
  limit?: number | null;
}

/* ------------------------------------------------------------------------ */
/*  HTTP                                                                    */
/* ------------------------------------------------------------------------ */

export async function listFilters(
  params?: { page?: number; page_size?: number },
): Promise<PaginatedResponse<Filter>> {
  return apiGet<PaginatedResponse<Filter>>(
    '/filters',
    params as Record<string, string | number | undefined>,
  );
}

export async function getFilter(id: number): Promise<Filter> {
  return apiGet<Filter>(`/filters/${id}`);
}

export type CreateFilterPayload = { name: string; query_json: string } & Partial<FilterColumns>;

export async function createFilter(payload: CreateFilterPayload): Promise<Filter> {
  return apiPost<CreateFilterPayload, Filter>('/filters', payload);
}

export type UpdateFilterPayload = Partial<{ name: string; query_json: string } & FilterColumns>;

/** The spec's update verb is PUT (`update_filter`); only present fields change. */
export async function updateFilter(id: number, payload: UpdateFilterPayload): Promise<Filter> {
  return apiPut<UpdateFilterPayload, Filter>(`/filters/${id}`, payload);
}

export async function deleteFilter(id: number): Promise<void> {
  return apiDelete(`/filters/${id}`);
}

/**
 * Run a structured filter now and page through the matching events. The
 * backend compiles it to a parameterised query and applies monitor ACLs.
 */
export async function previewFilter(
  ast: FilterAstQuery,
  params?: { page?: number; page_size?: number },
): Promise<PaginatedResponse<ZmEvent>> {
  const qs = new URLSearchParams();
  if (params?.page != null) qs.set('page', String(params.page));
  if (params?.page_size != null) qs.set('page_size', String(params.page_size));
  const suffix = qs.size > 0 ? `?${qs.toString()}` : '';
  return apiPost<FilterAstQuery, PaginatedResponse<ZmEvent>>(`/filters/preview${suffix}`, ast);
}

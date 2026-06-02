import { apiGet, apiPost, apiPut, apiDelete } from './client';
import type { PaginatedResponse } from '@/types';

export interface Filter {
  id: number;
  name: string;
  /** Serialised FilterQuery (see types below). Opaque to the backend. */
  query_json: string;
  auto_archive: number; // 0 | 1
  auto_delete: number;  // 0 | 1
  /** Minutes between scheduled executions (0 = manual only). */
  execute_interval: number;
  user_id?: number | null;
  email_format?: string | null;
}

/* ------------------------------------------------------------------------ */
/*  Local rule schema — serialised into Filter.query_json                   */
/* ------------------------------------------------------------------------ */

export type FilterField =
  | 'monitor_id'
  | 'cause'
  | 'archived'
  | 'max_score'
  | 'avg_score'
  | 'tot_score'
  | 'alarm_frames'
  | 'name'
  | 'notes'
  | 'start_date_time';

/**
 * Operator token set — kept aligned with legacy ZoneMinder's `Filter::opTypes()`
 * (see legacy-requirements/filters-list.md). The wire string is the legacy
 * token verbatim — that lets a filter saved by the new dashboard load
 * predictably even if `zmfilter.pl` ends up consuming it.
 *
 *   `=`, `!=`, `>`, `>=`, `<`, `<=`     numeric / string comparison
 *   `=~`, `!~`                           regex match / non-match
 *   `=[]`, `![]`                         IN / NOT IN (value = comma-separated)
 *   `IS`, `IS NOT`                       restricted to NULL / 0 / 1
 *   `LIKE`, `NOT LIKE`                   SQL LIKE (wraps %val% server-side)
 *   `contains`, `starts`, `ends`         dashboard-native string operators
 *                                        (kept for backwards compatibility
 *                                        with previously-saved filters)
 */
export type FilterOperator =
  | '='
  | '!='
  | '>'
  | '>='
  | '<'
  | '<='
  | '=~'
  | '!~'
  | '=[]'
  | '![]'
  | 'IS'
  | 'IS NOT'
  | 'LIKE'
  | 'NOT LIKE'
  | 'contains'
  | 'starts'
  | 'ends';

/** Operators added in P19 — used for UI labelling. */
export const FILTER_OPERATOR_LABELS: Record<FilterOperator, string> = {
  '=':         'equal to',
  '!=':        'not equal to',
  '>':         'greater than',
  '>=':        'greater than or equal to',
  '<':         'less than',
  '<=':        'less than or equal to',
  '=~':        'matches (regex)',
  '!~':        'does not match (regex)',
  '=[]':       'in set',
  '![]':       'not in set',
  'IS':        'is',
  'IS NOT':    'is not',
  'LIKE':      'like',
  'NOT LIKE':  'not like',
  'contains':  'contains',
  'starts':    'starts with',
  'ends':      'ends with',
};

export type FilterConjunction = 'and' | 'or';

export interface FilterRule {
  field: FilterField;
  operator: FilterOperator;
  /** Stringified value — runtime parses to the right type per field. */
  value: string;
  /** How this rule joins the previous one (first rule's value is ignored). */
  conjunction: FilterConjunction;
  /** Number of `(` to insert before this rule (legacy `obr`). 0 = none. */
  bracket_open?: number;
  /** Number of `)` to insert after this rule (legacy `cbr`). 0 = none. */
  bracket_close?: number;
}

/**
 * Auto-* action set. Mirrors legacy `Filters` table flag columns. Only
 * `auto_archive` / `auto_delete` / `execute_interval` are first-class fields
 * on the backend FilterResponse (verified against `/api/v3/filters` OpenAPI
 * schema). The remaining flags + their string operands are persisted inside
 * `query_json.options` until the backend grows columns for them.
 */
export interface FilterActions {
  auto_archive?: boolean;
  auto_delete?: boolean;
  auto_video?: boolean;
  auto_execute?: boolean;
  /** Shell command to run when `auto_execute` is on. */
  auto_execute_cmd?: string;
  auto_email?: boolean;
  /** Email To: comma-separated recipients. */
  email_to?: string;
  email_subject?: string;
  email_body?: string;
  /** 'Individual' | 'Summary' — legacy radio choice. */
  email_format?: string;
  email_server?: string;
  auto_message?: boolean;
  auto_copy?: boolean;
  /** Storage-area id (or 0 for sentinel) when `auto_copy` is on. */
  auto_copy_to?: number | null;
  auto_move?: boolean;
  auto_move_to?: number | null;
}

/**
 * Filter-options surface. Persisted client-side inside `query_json.options`
 * until the backend exposes them; `execute_interval` is the one that is
 * already first-class on the FilterResponse.
 */
export interface FilterOptions {
  background?: boolean;
  concurrent?: boolean;
  lock_rows?: boolean;
}

export interface FilterQuery {
  rules: FilterRule[];
  /** Sort + limit hints for client previewing. */
  sort?: { field: 'start_date_time' | 'id' | 'max_score' | 'frames'; dir: 'asc' | 'desc' };
  limit?: number;
  /** Filter-level options carried in-band (background/concurrent/lock_rows). */
  options?: FilterOptions;
  /** Auto-* action flags not exposed by the backend FilterResponse yet. */
  actions?: FilterActions;
}

const EMPTY_QUERY: FilterQuery = { rules: [], sort: { field: 'start_date_time', dir: 'desc' } };

export function parseFilterQuery(s: string | null | undefined): FilterQuery {
  if (!s) return EMPTY_QUERY;
  try {
    const parsed = JSON.parse(s) as Partial<FilterQuery> & Record<string, unknown>;
    return {
      rules: Array.isArray(parsed.rules) ? (parsed.rules as FilterRule[]) : [],
      sort: parsed.sort ?? EMPTY_QUERY.sort,
      limit: parsed.limit,
      options: parsed.options,
      actions: parsed.actions,
    };
  } catch {
    return EMPTY_QUERY;
  }
}

export function serializeFilterQuery(q: FilterQuery): string {
  return JSON.stringify(q);
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

export interface CreateFilterPayload {
  name: string;
  query_json: string;
  execute_interval?: number;
  user_id?: number | null;
  email_format?: string | null;
}

export async function createFilter(payload: CreateFilterPayload): Promise<Filter> {
  return apiPost<CreateFilterPayload, Filter>('/filters', payload);
}

export async function updateFilter(
  id: number,
  payload: { name?: string; query?: string },
): Promise<Filter> {
  return apiPut<{ name?: string; query?: string }, Filter>(`/filters/${id}`, payload);
}

export async function deleteFilter(id: number): Promise<void> {
  return apiDelete(`/filters/${id}`);
}

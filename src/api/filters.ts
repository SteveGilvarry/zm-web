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

export type FilterOperator = '=' | '!=' | '>' | '<' | 'contains' | 'starts' | 'ends';

export type FilterConjunction = 'and' | 'or';

export interface FilterRule {
  field: FilterField;
  operator: FilterOperator;
  /** Stringified value — runtime parses to the right type per field. */
  value: string;
  /** How this rule joins the previous one (first rule's value is ignored). */
  conjunction: FilterConjunction;
}

export interface FilterQuery {
  rules: FilterRule[];
  /** Sort + limit hints for client previewing. */
  sort?: { field: 'start_date_time' | 'id' | 'max_score' | 'frames'; dir: 'asc' | 'desc' };
  limit?: number;
}

const EMPTY_QUERY: FilterQuery = { rules: [], sort: { field: 'start_date_time', dir: 'desc' } };

export function parseFilterQuery(s: string | null | undefined): FilterQuery {
  if (!s) return EMPTY_QUERY;
  try {
    const parsed = JSON.parse(s) as FilterQuery;
    return {
      rules: Array.isArray(parsed.rules) ? parsed.rules : [],
      sort: parsed.sort ?? EMPTY_QUERY.sort,
      limit: parsed.limit,
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

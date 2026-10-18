import { apiDelete, apiGet } from './client';
import type { PaginatedResponse } from '@/types';

/** One log entry from `/api/v3/logs`. */
export interface LogEntry {
  id: number;
  time_key: string;
  /**
   * Numeric ZoneMinder level (`Logger::codes`): -4=PANIC, -3=FATAL,
   * -2=ERROR, -1=WARNING, 0=INFO, 1..9=DEBUG (higher = chattier).
   */
  level: number;
  /** Short code as ZM wrote it: "PNC", "FAT", "ERR", "WAR", "INF", "DBG". */
  code: string;
  /** Daemon / module that emitted the log. */
  component: string;
  message: string;
  pid?: number | null;
  server_id?: number | null;
  file?: string | null;
  line?: number | null;
}

/**
 * `min_level` — the severity threshold the legacy Log view's dropdown always
 * meant: "this severity **or worse**". `fatal` also catches PANIC (-4) and
 * the audit rows ZoneMinder writes at -5. Names, not numbers: the backend
 * answers 400 for anything outside this list (zm-api#21).
 */
export const LOG_MIN_LEVELS = ['fatal', 'error', 'warning', 'info', 'debug'] as const;
export type LogMinLevel = (typeof LOG_MIN_LEVELS)[number];

export function isLogMinLevel(v: unknown): v is LogMinLevel {
  return typeof v === 'string' && (LOG_MIN_LEVELS as readonly string[]).includes(v);
}

/** `LogSort` — sort direction. Default `desc` (newest first). */
export type LogSort = 'asc' | 'desc';

/**
 * `LogSortField` — the column the list is ordered by (zm-api#142). Default
 * `time`. Mirrors legacy's sortable headers.
 */
export const LOG_SORT_FIELDS = [
  'time', 'id', 'component', 'server_id', 'pid', 'level', 'code', 'message', 'file', 'line',
] as const;
export type LogSortField = (typeof LOG_SORT_FIELDS)[number];

export function isLogSortField(v: unknown): v is LogSortField {
  return typeof v === 'string' && (LOG_SORT_FIELDS as readonly string[]).includes(v);
}

/** Filters shared by `GET /logs` and `DELETE /logs`. */
export interface LogFilterParams {
  /** Filter to a specific component (zmc, zma, zmaudit, …). */
  component?: string;
  /** Severity threshold: this level or worse. */
  min_level?: LogMinLevel;
  /**
   * Exact `Logs.Level` match, one value or a comma list (`-1,-5`), on the
   * inverted scale: 0 = INFO, -1 = WARNING, -2 = ERROR, -3 = FATAL,
   * -4 = PANIC, -5 = AUDIT, positive = debug (zm-api#142). Legacy's level
   * multi-select maps onto this; for "this severe or worse" use `min_level`.
   */
  level?: number | string;
  /**
   * Only these log ids, as a comma list. On `DELETE` this clears exactly the
   * rows an operator ticked (zm-api#142).
   */
  ids?: string;
  /** Case-insensitive substring match on the message. */
  search?: string;
  /** Unix seconds; rows at or after this instant. */
  start?: number;
  /** Unix seconds; rows at or before this instant. */
  end?: number;
  server_id?: number;
}

export interface LogQueryParams extends LogFilterParams {
  page?: number;
  page_size?: number;
  sort?: LogSort;
  /** Column to sort on; default `time`. */
  sort_by?: LogSortField;
  /**
   * Also return `total_unfiltered`, the row count of the whole table — the
   * "Available" figure legacy prints next to the filtered total. Off by
   * default: it is a second `COUNT(*)` on every request.
   */
  unfiltered_total?: boolean;
}

/** `PaginatedLogsResponse`: the page plus `total_unfiltered` when asked for. */
export interface LogsPage extends PaginatedResponse<LogEntry> {
  total_unfiltered?: number | null;
}

export async function listLogs(params?: LogQueryParams): Promise<LogsPage> {
  return apiGet<LogsPage>('/logs', params as Record<string, string | number | undefined>);
}

/**
 * Distinct `Logs.Component` values, sorted — what legacy's Component select
 * lists (zm-api#142). Before this route the UI could only offer the
 * components on the current page.
 */
export async function listLogComponents(): Promise<string[]> {
  return apiGet<string[]>('/logs/components');
}

/**
 * Legacy "Clear Logs", scoped by the same filters as the list — so the
 * operator deletes what the view is showing, not the whole table. Needs
 * System (admin) permission; answers the number of rows deleted.
 */
export async function clearLogs(params?: LogFilterParams): Promise<{ message: string }> {
  const qs = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([k, v]) => {
    if (v !== undefined && v !== '') qs.append(k, String(v));
  });
  const query = qs.toString();
  // `apiDelete` is typed `Promise<void>` but resolves to the parsed body.
  return (await apiDelete(`/logs${query ? `?${query}` : ''}`)) as unknown as { message: string };
}

export async function getLog(id: number): Promise<LogEntry> {
  return apiGet<LogEntry>(`/logs/${id}`);
}

/** ZoneMinder's `Logger` level numbers. */
export const LOG_LEVEL = {
  PANIC: -4,
  FATAL: -3,
  ERROR: -2,
  WARNING: -1,
  INFO: 0,
  DEBUG: 1,
} as const;

/** Human-readable level label (ZoneMinder convention: lower number = more severe). */
export function levelLabel(level: number): string {
  if (level <= LOG_LEVEL.PANIC) return 'PANIC';
  switch (level) {
    case LOG_LEVEL.FATAL:   return 'FATAL';
    case LOG_LEVEL.ERROR:   return 'ERROR';
    case LOG_LEVEL.WARNING: return 'WARNING';
    case LOG_LEVEL.INFO:    return 'INFO';
    case LOG_LEVEL.DEBUG:   return 'DEBUG';
    default: return `DEBUG ${level}`;
  }
}

/** Tailwind text colour for a level — bright + saturated for high severity. */
export function levelColor(level: number): string {
  if (level <= LOG_LEVEL.ERROR)   return 'text-crimson';
  if (level === LOG_LEVEL.WARNING) return 'text-amber';
  if (level === LOG_LEVEL.INFO)    return 'text-cyan';
  return 'text-text-muted';
}

/** Row background tint for the logs table, by severity. */
export function levelRowTint(level: number): string {
  if (level <= LOG_LEVEL.FATAL)   return 'bg-crimson/20';
  if (level === LOG_LEVEL.ERROR)  return 'bg-crimson/10';
  if (level === LOG_LEVEL.WARNING) return 'bg-amber/10';
  return '';
}

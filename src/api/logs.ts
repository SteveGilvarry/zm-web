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

/** `LogSort` — order on `time_key`. Default `desc` (newest first). */
export type LogSort = 'asc' | 'desc';

/** Filters shared by `GET /logs` and `DELETE /logs`. */
export interface LogFilterParams {
  /** Filter to a specific component (zmc, zma, zmaudit, …). */
  component?: string;
  /** Severity threshold: this level or worse. */
  min_level?: LogMinLevel;
  /** Exact `Logs.Level` match (inverted scale: 0 = INFO, -2 = ERROR). */
  level?: number;
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
}

export async function listLogs(
  params?: LogQueryParams,
): Promise<PaginatedResponse<LogEntry>> {
  return apiGet<PaginatedResponse<LogEntry>>(
    '/logs',
    params as Record<string, string | number | undefined>,
  );
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

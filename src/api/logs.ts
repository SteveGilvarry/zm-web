import { apiGet } from './client';
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

export interface LogQueryParams {
  page?: number;
  page_size?: number;
  /** Filter to a specific component (zmc, zma, zmaudit, …). */
  component?: string;
  /**
   * Numeric lower bound: the backend returns rows with `level >= this`,
   * i.e. this severity **and everything less severe** (zm-api BT-04). To
   * show "errors and worse" you must filter client-side.
   */
  level?: number;
  server_id?: number;
}

export async function listLogs(
  params?: LogQueryParams,
): Promise<PaginatedResponse<LogEntry>> {
  return apiGet<PaginatedResponse<LogEntry>>(
    '/logs',
    params as Record<string, string | number | undefined>,
  );
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

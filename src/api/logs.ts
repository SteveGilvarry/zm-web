import { apiGet } from './client';
import type { PaginatedResponse } from '@/types';

/** One log entry from `/api/v3/logs`. */
export interface LogEntry {
  id: number;
  time_key: string;
  /** Numeric ZM level: 0=DEBUG, 1=INFO, 2=WARNING, 3=ERROR, etc. */
  level: number;
  /** Short code, e.g. "DBG", "INF", "WAR", "ERR". */
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
  /** Filter to entries at this severity or higher (numerical level). */
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

/** Human-readable level label (ZoneMinder convention: lower number = more severe). */
export function levelLabel(level: number): string {
  switch (level) {
    case -3: return 'PANIC';
    case -2: return 'FATAL';
    case -1: return 'ERROR';
    case  0: return 'WARNING';
    case  1: return 'INFO';
    case  2: return 'DEBUG';
    default: return `LVL ${level}`;
  }
}

/** Tailwind colour class for a level — bright + saturated for high severity. */
export function levelColor(level: number): string {
  if (level <= -2) return 'text-crimson';
  if (level === -1) return 'text-crimson';
  if (level === 0)  return 'text-amber';
  if (level === 1)  return 'text-cyan';
  return 'text-text-muted';
}

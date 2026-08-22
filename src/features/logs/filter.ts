import { LOG_LEVEL, type LogEntry } from '@/api/logs';

/**
 * Parse a value out of a Logs `time_key` field. The backend ships these
 * as either an ISO-8601 string or as a Unix epoch (with optional
 * microseconds suffix), so we accept both.
 *
 * Returns NaN for unparseable input so callers can simply drop unmatched rows.
 */
export function parseLogTime(timeKey: string): number {
  if (!timeKey) return NaN;
  // Numeric (possibly fractional) epoch
  if (/^-?\d+(\.\d+)?$/.test(timeKey)) {
    const seconds = Number(timeKey);
    return seconds * 1000;
  }
  return Date.parse(timeKey);
}

/**
 * Translate the form's `datetime-local` value (local wall clock) into the
 * Unix seconds the API's `start` / `end` bounds take. Returns null for
 * empty / unparseable input so callers can treat that as "not set".
 */
export function dateInputToUnix(value: string): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

/**
 * Bucket the rows on screen into the summary-strip counts, on ZoneMinder's
 * scale (lower = more severe):
 *   - errors:   level <= -2  (ERROR, FATAL, PANIC)
 *   - warnings: level === -1
 *   - info:     level === 0
 *   - debug:    level >= 1
 *
 * These describe the page in front of the operator, not the whole table —
 * the strip's own readout carries the server-wide total beside them.
 */
export function summarizeLogs(
  logs: LogEntry[],
): { errors: number; warnings: number; info: number; debug: number } {
  let errors = 0;
  let warnings = 0;
  let info = 0;
  let debug = 0;
  for (const log of logs) {
    if (log.level <= LOG_LEVEL.ERROR) errors++;
    else if (log.level === LOG_LEVEL.WARNING) warnings++;
    else if (log.level === LOG_LEVEL.INFO) info++;
    else debug++;
  }
  return { errors, warnings, info, debug };
}


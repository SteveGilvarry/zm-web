import type { LogEntry } from '@/api/logs';

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
 * Client-side message search. Empty / whitespace-only queries match
 * everything. Match is case-insensitive substring across the message
 * field — same semantics legacy advertises for its toolbar Search box.
 */
export function matchesMessageQuery(log: LogEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return log.message.toLowerCase().includes(q);
}

/**
 * Client-side date-range filter. `startMs` / `endMs` may be null to leave
 * that side unbounded. End is inclusive of the timestamp itself.
 */
export function withinTimeRange(
  log: LogEntry,
  startMs: number | null,
  endMs: number | null,
): boolean {
  if (startMs === null && endMs === null) return true;
  const t = parseLogTime(log.time_key);
  if (Number.isNaN(t)) return false;
  if (startMs !== null && t < startMs) return false;
  if (endMs !== null && t > endMs) return false;
  return true;
}

/**
 * Translate the form's `datetime-local` value into milliseconds.
 * Returns null for empty / unparseable input so callers can treat that
 * as "not set".
 */
export function dateInputToMs(value: string): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Bucket a page of logs into legacy summary-strip counts:
 *   - errors:   level <= -1
 *   - warnings: level === 0
 *   - info:     level >= 1
 *
 * Useful when the operator has filtered to a single level (or none): the
 * summary still reflects what's in front of them, not the global table.
 */
export function summarizeLogs(
  logs: LogEntry[],
): { errors: number; warnings: number; info: number } {
  let errors = 0;
  let warnings = 0;
  let info = 0;
  for (const log of logs) {
    if (log.level <= -1) errors++;
    else if (log.level === 0) warnings++;
    else info++;
  }
  return { errors, warnings, info };
}

import type { ZmEvent } from '@/types';

/**
 * Per-day bucket of total event seconds, indexed by hour-of-day (0..23).
 * Each entry's `seconds` array has length 24; entry i holds the sum of
 * `event.length` for events that started in that local hour on that date.
 */
export interface DailyBucket {
  /** Local calendar date in `YYYY-MM-DD` form. */
  date: string;
  /** 24-element array; index = local hour, value = sum of length (seconds). */
  seconds: number[];
}

/**
 * Group events into per-day, per-hour buckets summing `length` (seconds).
 *
 * Mirrors the legacy ZM report chart: each calendar date in the matched
 * event set becomes a dataset; each hour-of-day (0..23) sums the clip
 * length for events that started in that hour on that date.
 *
 * - Skips events with no parseable `start_date_time`.
 * - `length` is a DECIMAL column the API serialises as a string
 *   ("579.93"); it is parsed, and null/undefined/NaN count as 0.
 * - Uses the host's local timezone for hour-of-day + date bucketing,
 *   matching how the legacy PHP chart renders against the server clock.
 * - Returned buckets are sorted by `date` ascending.
 */
export function bucketEventsByHour(events: ZmEvent[] | undefined): DailyBucket[] {
  if (!events?.length) return [];

  const byDate = new Map<string, number[]>();

  for (const e of events) {
    const ts = e.start_date_time;
    if (!ts) continue;
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) continue;

    const dateKey = localDateKey(d);
    const hour = d.getHours();
    const len = eventLengthSeconds(e.length);

    let row = byDate.get(dateKey);
    if (!row) {
      row = new Array<number>(24).fill(0);
      byDate.set(dateKey, row);
    }
    row[hour] = (row[hour] ?? 0) + len;
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, seconds]) => ({ date, seconds }));
}

/**
 * `ZmEvent.length` as a non-negative number of seconds. The API sends the
 * DECIMAL column as a string; older fixtures and some builds send a number.
 * Anything unparseable (or negative) contributes nothing to the bucket.
 */
export function eventLengthSeconds(length: ZmEvent['length'] | null | undefined): number {
  if (length == null) return 0;
  const n = typeof length === 'string' ? Number(length.trim()) : length;
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/** `YYYY-MM-DD` in the host's local timezone. */
function localDateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Format a `YYYY-MM-DD` key as e.g. `Jun 3` for chart legend labels. */
export function formatDateLabel(dateKey: string): string {
  // Append a fixed local time so the date parses in the host TZ rather
  // than shifting by UTC offset.
  const d = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

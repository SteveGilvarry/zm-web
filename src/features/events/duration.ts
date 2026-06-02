/**
 * Coerce a `ZmEvent.length` (or any nullable number) into a non-negative
 * integer number of seconds. The backend occasionally serialises `length`
 * as a decimal string ("12.341"); legacy ZM rounds for footer-row totals.
 */
export function eventDurationSeconds(length: number | string | null | undefined): number {
  if (length == null) return 0;
  const n = typeof length === 'string' ? Number(length) : length;
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
}

/** HH:MM:SS for a duration in seconds. Drops the leading "00:" when ≤ 1 h. */
export function formatDuration(secondsRaw: number | string | null | undefined): string {
  const seconds = eventDurationSeconds(secondsRaw);
  if (seconds <= 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Sum of `length` across the visible events page (used in footer row). */
export function sumEventDurations(events: Array<{ length: number | string | null | undefined }>): number {
  return events.reduce((acc, e) => acc + eventDurationSeconds(e.length), 0);
}

/** Sum of `disk_space` across the visible events page (used in footer row). */
export function sumEventDiskSpace(events: Array<{ disk_space?: number | null }>): number {
  return events.reduce((acc, e) => acc + (e.disk_space ?? 0), 0);
}

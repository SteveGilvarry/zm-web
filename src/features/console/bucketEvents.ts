import type { ZmEvent } from '@/types';

/**
 * Bucket events into a per-monitor × per-hour histogram for the 24-hour
 * sparkline. Index 0 in each monitor's array is the current hour
 * (newest); index 23 is ~24 hours ago.
 *
 * The reference point ('anchor') is the most recent event's timestamp
 * rather than the client clock — that keeps the histogram correct when
 * the backend / camera clock drifts relative to the browser. Negatives
 * (events ever-so-slightly past the anchor) clamp to 0 instead of being
 * dropped; events older than 24h are skipped entirely.
 *
 * Pure helper — no React, no global state — so unit tests can pin a
 * deterministic anchor and assert exact bucket values.
 */
export function bucketEventsByHour(
  events: readonly ZmEvent[] | undefined,
  /** Optional override for the anchor; defaults to the freshest event. */
  anchorOverride?: number,
): Record<number, number[]> {
  const out: Record<number, number[]> = {};
  if (!events || events.length === 0) return out;

  let anchor = anchorOverride ?? 0;
  if (anchor === 0) {
    for (const e of events) {
      if (!e.start_date_time) continue;
      const t = Date.parse(e.start_date_time);
      if (!Number.isNaN(t) && t > anchor) anchor = t;
    }
    if (anchor === 0) anchor = Date.now();
  }

  for (const e of events) {
    if (!e.start_date_time) continue;
    const t = Date.parse(e.start_date_time);
    if (Number.isNaN(t)) continue;
    let hoursAgo = Math.floor((anchor - t) / (60 * 60 * 1000));
    if (hoursAgo < 0) hoursAgo = 0;
    if (hoursAgo > 23) continue;
    const buckets = out[e.monitor_id] ?? (out[e.monitor_id] = new Array(24).fill(0));
    buckets[hoursAgo] += 1;
  }
  return out;
}

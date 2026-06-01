import { describe, expect, it } from 'vitest';
import { bucketEventsByHour } from './bucketEvents';
import type { ZmEvent } from '@/types';

// Anchor reference for all tests: 2026-05-24T12:00:00Z.
const ANCHOR = Date.parse('2026-05-24T12:00:00Z');

const ev = (monitorId: number, isoTime: string): ZmEvent =>
  ({
    id: 1,
    monitor_id: monitorId,
    start_date_time: isoTime,
  } as unknown as ZmEvent);

describe('bucketEventsByHour', () => {
  it('returns an empty object for empty input', () => {
    expect(bucketEventsByHour([])).toEqual({});
    expect(bucketEventsByHour(undefined)).toEqual({});
  });

  it('buckets events at the right hours-ago index', () => {
    const out = bucketEventsByHour([
      ev(1, '2026-05-24T11:30:00Z'), // 30 min before anchor → index 0
      ev(1, '2026-05-24T10:30:00Z'), // 90 min before → index 1
      ev(1, '2026-05-23T13:00:00Z'), // 23h before exactly → index 23
    ], ANCHOR);

    expect(out[1]).toBeDefined();
    expect(out[1][0]).toBe(1);
    expect(out[1][1]).toBe(1);
    expect(out[1][23]).toBe(1);
    expect(out[1][2]).toBe(0);
  });

  it('clamps events past the anchor (future timestamps) to index 0', () => {
    // 5 minutes AFTER anchor — backend clock skew. Should still count, in
    // bucket 0, not get dropped.
    const out = bucketEventsByHour(
      [ev(1, '2026-05-24T12:05:00Z')],
      ANCHOR,
    );
    expect(out[1][0]).toBe(1);
  });

  it('drops events older than 24h', () => {
    const out = bucketEventsByHour(
      [ev(1, '2026-05-22T12:00:00Z')], // 48h ago
      ANCHOR,
    );
    expect(out[1]).toBeUndefined();
  });

  it('keeps separate buckets per monitor', () => {
    const out = bucketEventsByHour([
      ev(1, '2026-05-24T11:00:00Z'), // monitor 1, 1h ago
      ev(2, '2026-05-24T11:00:00Z'), // monitor 2, 1h ago
      ev(2, '2026-05-24T10:00:00Z'), // monitor 2, 2h ago
    ], ANCHOR);

    expect(out[1][1]).toBe(1);
    expect(out[2][1]).toBe(1);
    expect(out[2][2]).toBe(1);
  });

  it('skips events without a parseable timestamp', () => {
    const out = bucketEventsByHour([
      ev(1, ''),
      ev(1, 'not-a-date'),
      ev(1, '2026-05-24T11:00:00Z'),
    ], ANCHOR);
    // Only the one valid event counted.
    expect(out[1][1]).toBe(1);
    const total = out[1].reduce((s, v) => s + v, 0);
    expect(total).toBe(1);
  });

  it('uses the freshest event timestamp as anchor when none is provided', () => {
    // Three events spread over 3 hours. With auto-anchor = freshest, the
    // freshest lands at bucket 0, the middle at 1, the oldest at 2.
    const out = bucketEventsByHour([
      ev(1, '2026-05-24T10:00:00Z'),
      ev(1, '2026-05-24T11:00:00Z'),
      ev(1, '2026-05-24T12:00:00Z'),
    ]);
    expect(out[1][0]).toBe(1);
    expect(out[1][1]).toBe(1);
    expect(out[1][2]).toBe(1);
  });

  it('accumulates multiple events in the same hour', () => {
    const out = bucketEventsByHour([
      ev(1, '2026-05-24T11:10:00Z'),
      ev(1, '2026-05-24T11:20:00Z'),
      ev(1, '2026-05-24T11:50:00Z'),
    ], ANCHOR);
    expect(out[1][0]).toBe(3);
  });
});

import { describe, expect, it } from 'vitest';
import { bucketEventsByHour, eventLengthSeconds, formatDateLabel } from './bucketEventsByHour';
import type { ZmEvent } from '@/types';

/**
 * Construct a partial ZmEvent for testing. The bucketing function only
 * touches `start_date_time` and `length`; the rest is shape-padding.
 */
function ev(start: string | null | undefined, length: number | string, id = 1): ZmEvent {
  return {
    id,
    start_date_time: start,
    length,
  } as unknown as ZmEvent;
}

describe('bucketEventsByHour', () => {
  it('returns an empty array for empty / undefined input', () => {
    expect(bucketEventsByHour([])).toEqual([]);
    expect(bucketEventsByHour(undefined)).toEqual([]);
  });

  it('sums event.length per local hour into a 24-cell row per date', () => {
    // Use a fixed local clock-time anchor so the hour assertions hold in
    // any TZ. Constructing without a Z suffix makes Date parse it as local.
    const out = bucketEventsByHour([
      ev('2026-06-03T10:15:00', 30),
      ev('2026-06-03T10:45:00', 20),
      ev('2026-06-03T14:00:00', 60),
      ev('2026-06-04T02:30:00', 5),
    ]);

    expect(out).toHaveLength(2);
    expect(out[0].date).toBe('2026-06-03');
    expect(out[0].seconds).toHaveLength(24);
    expect(out[0].seconds[10]).toBe(50);
    expect(out[0].seconds[14]).toBe(60);
    expect(out[0].seconds[0]).toBe(0);

    expect(out[1].date).toBe('2026-06-04');
    expect(out[1].seconds[2]).toBe(5);
  });

  it('sorts the returned buckets by date ascending', () => {
    const out = bucketEventsByHour([
      ev('2026-06-05T10:00:00', 1),
      ev('2026-06-03T10:00:00', 1),
      ev('2026-06-04T10:00:00', 1),
    ]);
    expect(out.map((b) => b.date)).toEqual([
      '2026-06-03',
      '2026-06-04',
      '2026-06-05',
    ]);
  });

  it('skips events with missing / unparseable start_date_time', () => {
    const out = bucketEventsByHour([
      ev(null, 10),
      ev(undefined, 10),
      ev('', 10),
      ev('not-a-date', 10),
      ev('2026-06-03T10:00:00', 7),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].seconds[10]).toBe(7);
  });

  it('treats missing / non-finite length as zero', () => {
    const out = bucketEventsByHour([
      ev('2026-06-03T10:00:00', NaN as unknown as number),
      ev('2026-06-03T10:00:00', undefined as unknown as number),
      ev('2026-06-03T10:00:00', 12),
    ]);
    expect(out[0].seconds[10]).toBe(12);
  });

  it('parses the string `length` the API actually sends (DECIMAL column)', () => {
    // Live shape: {"length":"600.00"}. Before this was explicit the chart
    // summed to zero because Number.isFinite('600.00') is false.
    const out = bucketEventsByHour([
      ev('2026-06-03T10:00:00', '600.00'),
      ev('2026-06-03T10:20:00', '12.50'),
      ev('2026-06-03T10:40:00', ''),
      ev('2026-06-03T10:50:00', 'abc'),
    ]);
    expect(out[0].seconds[10]).toBeCloseTo(612.5, 5);
  });

  it('accumulates fractional event lengths in the same bucket', () => {
    const out = bucketEventsByHour([
      ev('2026-06-03T09:01:00', 12.5),
      ev('2026-06-03T09:30:00', 7.25),
    ]);
    expect(out[0].seconds[9]).toBeCloseTo(19.75, 5);
  });
});

describe('eventLengthSeconds', () => {
  it('accepts numbers and numeric strings, rejects the rest', () => {
    expect(eventLengthSeconds(30)).toBe(30);
    expect(eventLengthSeconds('579.93')).toBeCloseTo(579.93, 5);
    expect(eventLengthSeconds(' 4 ')).toBe(4);
    expect(eventLengthSeconds(null)).toBe(0);
    expect(eventLengthSeconds(undefined)).toBe(0);
    expect(eventLengthSeconds('')).toBe(0);
    expect(eventLengthSeconds(-5)).toBe(0);
    expect(eventLengthSeconds(NaN)).toBe(0);
  });
});

describe('formatDateLabel', () => {
  it('formats YYYY-MM-DD as "Mon D" in the host locale', () => {
    // Locale-specific format string varies, but month abbrev + day number
    // should both appear in the en-US default test runtime.
    const label = formatDateLabel('2026-06-03');
    expect(label).toMatch(/Jun/);
    expect(label).toMatch(/3/);
  });

  it('falls back to the raw key on an invalid date', () => {
    expect(formatDateLabel('not-a-date')).toBe('not-a-date');
  });
});

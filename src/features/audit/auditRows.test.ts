import { describe, expect, it } from 'vitest';
import { computeAuditStats, compareAuditRows, defaultAuditWindow, type AuditRow } from './auditRows';

const ev = (id: number, start: string, end: string | null, length = 0) => ({
  id, start_date_time: start, end_date_time: end, length,
});

describe('computeAuditStats', () => {
  it('returns empty stats for no events', () => {
    expect(computeAuditStats([])).toEqual({ events: 0, first: null, last: null, minGap: null, maxGap: null });
  });

  it('finds first/last by start time and min/max gap from end to next start', () => {
    const stats = computeAuditStats([
      ev(3, '2026-08-21T06:20:00Z', '2026-08-21T06:25:00Z'),
      ev(1, '2026-08-21T06:00:00Z', '2026-08-21T06:05:00Z'),
      ev(2, '2026-08-21T06:07:00Z', '2026-08-21T06:10:00Z'),
    ]);
    expect(stats.events).toBe(3);
    expect(stats.first).toEqual({ id: 1, at: '2026-08-21T06:00:00Z' });
    expect(stats.last).toEqual({ id: 3, at: '2026-08-21T06:20:00Z' });
    expect(stats.minGap).toBe(120);
    expect(stats.maxGap).toBe(600);
  });

  it('derives an open event\'s end from its length and clamps overlaps to 0', () => {
    const stats = computeAuditStats([
      ev(1, '2026-08-21T06:00:00Z', null, 600),
      ev(2, '2026-08-21T06:05:00Z', '2026-08-21T06:06:00Z'),
    ]);
    expect(stats.minGap).toBe(0);
    expect(stats.maxGap).toBe(0);
  });

  it('a single event has no gaps', () => {
    const stats = computeAuditStats([ev(1, '2026-08-21T06:00:00Z', '2026-08-21T06:05:00Z')]);
    expect(stats.minGap).toBeNull();
    expect(stats.maxGap).toBeNull();
  });
});

describe('compareAuditRows', () => {
  const row = (id: number, name: string, events: number, minGap: number | null): AuditRow => ({
    monitor: { id, name } as AuditRow['monitor'],
    stats: { events, first: null, last: null, minGap, maxGap: null },
    loading: false,
    error: null,
  });
  it('sorts by each key and treats missing gaps as smallest', () => {
    const a = row(1, 'B', 5, null);
    const b = row(2, 'A', 2, 30);
    expect(compareAuditRows(a, b, 'id')).toBeLessThan(0);
    expect(compareAuditRows(a, b, 'name')).toBeGreaterThan(0);
    expect(compareAuditRows(a, b, 'events')).toBeGreaterThan(0);
    expect(compareAuditRows(a, b, 'minGap')).toBeLessThan(0);
  });
});

describe('defaultAuditWindow', () => {
  it('is the hour ending one hour ago', () => {
    const now = new Date('2026-08-21T08:37:03Z');
    const w = defaultAuditWindow(now);
    expect(w.min.toISOString()).toBe('2026-08-21T06:37:03.000Z');
    expect(w.max.toISOString()).toBe('2026-08-21T07:37:03.000Z');
  });
});

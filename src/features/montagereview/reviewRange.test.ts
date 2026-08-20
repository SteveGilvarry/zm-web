import { describe, expect, it } from 'vitest';
import { panRange, parseLegacyTime, zoomRange } from './useMontageReviewPage';

describe('parseLegacyTime', () => {
  it('reads the legacy "YYYY-MM-DD HH:MM:SS" form as local time and ISO as-is', () => {
    const d = parseLegacyTime('2026-08-21 13:45:10');
    expect(d).not.toBeNull();
    expect(d!.getHours()).toBe(13);
    expect(d!.getMinutes()).toBe(45);
    expect(parseLegacyTime('2026-08-21T03:00:00Z')?.toISOString()).toBe('2026-08-21T03:00:00.000Z');
  });
  it('rejects junk', () => {
    expect(parseLegacyTime('yesterday')).toBeNull();
    expect(parseLegacyTime(undefined)).toBeNull();
  });
});

describe('pan / zoom', () => {
  const start = new Date('2026-08-21T00:00:00Z');
  const end = new Date('2026-08-21T02:00:00Z');
  it('pans by a fraction of the window in either direction', () => {
    expect(panRange(start, end, 0.5)).toEqual({ start: new Date('2026-08-21T01:00:00Z'), end: new Date('2026-08-21T03:00:00Z') });
    expect(panRange(start, end, -0.5).start.toISOString()).toBe('2026-08-20T23:00:00.000Z');
  });
  it('zooms around the playhead and refuses to collapse below a minute', () => {
    const mid = new Date('2026-08-21T01:00:00Z');
    expect(zoomRange(start, end, 0.5, mid)).toEqual({ start: new Date('2026-08-21T00:30:00Z'), end: new Date('2026-08-21T01:30:00Z') });
    expect(zoomRange(start, end, 2, start)).toEqual({ start, end: new Date('2026-08-21T04:00:00Z') });
    const tiny = zoomRange(mid, new Date(mid.getTime() + 90_000), 0.5, mid);
    expect(tiny.end.getTime() - tiny.start.getTime()).toBe(90_000);
  });
});

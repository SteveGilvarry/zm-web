import { describe, expect, it } from 'vitest';
import type { LogEntry } from '@/api/logs';
import {
  dateInputToMs,
  matchesLevel,
  matchesMessageQuery,
  parseLogTime,
  summarizeLogs,
  withinTimeRange,
} from './filter';

function makeLog(over: Partial<LogEntry> = {}): LogEntry {
  return {
    id: 1,
    time_key: '2026-06-01T10:00:00Z',
    level: 0,
    code: 'INF',
    component: 'zmc',
    message: 'starting capture',
    pid: 4321,
    server_id: null,
    file: 'zm_monitor.cpp',
    line: 123,
    ...over,
  };
}

describe('parseLogTime', () => {
  it('parses ISO-8601 strings', () => {
    expect(parseLogTime('2026-06-01T10:00:00Z')).toBe(Date.UTC(2026, 5, 1, 10, 0, 0));
  });

  it('parses Unix epoch seconds (with optional microseconds)', () => {
    // 1704067200 = 2024-01-01T00:00:00Z
    expect(parseLogTime('1704067200')).toBe(1704067200_000);
    expect(parseLogTime('1704067200.5')).toBe(1704067200_500);
  });

  it('returns NaN for unparseable input', () => {
    expect(Number.isNaN(parseLogTime('not-a-date'))).toBe(true);
    expect(Number.isNaN(parseLogTime(''))).toBe(true);
  });
});

describe('matchesMessageQuery', () => {
  it('matches any log when the query is empty / whitespace', () => {
    expect(matchesMessageQuery(makeLog(), '')).toBe(true);
    expect(matchesMessageQuery(makeLog(), '   ')).toBe(true);
  });

  it('does a case-insensitive substring match on the message field', () => {
    const log = makeLog({ message: 'Capture daemon STARTED on monitor 3' });
    expect(matchesMessageQuery(log, 'capture')).toBe(true);
    expect(matchesMessageQuery(log, 'CAPTURE')).toBe(true);
    expect(matchesMessageQuery(log, 'monitor 3')).toBe(true);
    expect(matchesMessageQuery(log, 'monitor 7')).toBe(false);
  });
});

describe('withinTimeRange', () => {
  const log = makeLog({ time_key: '2026-06-01T10:00:00Z' });
  const t = Date.UTC(2026, 5, 1, 10, 0, 0);

  it('passes everything when both bounds are null', () => {
    expect(withinTimeRange(log, null, null)).toBe(true);
  });

  it('filters out logs older than startMs', () => {
    expect(withinTimeRange(log, t - 1000, null)).toBe(true);
    expect(withinTimeRange(log, t + 1000, null)).toBe(false);
  });

  it('filters out logs newer than endMs', () => {
    expect(withinTimeRange(log, null, t + 1000)).toBe(true);
    expect(withinTimeRange(log, null, t - 1000)).toBe(false);
  });

  it('treats both bounds as inclusive', () => {
    expect(withinTimeRange(log, t, t)).toBe(true);
  });

  it('drops logs with unparseable timestamps when a bound is set', () => {
    const bogus = makeLog({ time_key: 'not-a-date' });
    expect(withinTimeRange(bogus, t, null)).toBe(false);
  });
});

describe('dateInputToMs', () => {
  it('returns null for empty input', () => {
    expect(dateInputToMs('')).toBeNull();
  });

  it('returns null for unparseable input', () => {
    expect(dateInputToMs('not-a-date')).toBeNull();
  });

  it('parses a datetime-local style string', () => {
    const ms = dateInputToMs('2026-06-01T10:30');
    expect(typeof ms).toBe('number');
    expect(Number.isNaN(ms!)).toBe(false);
  });
});

describe('summarizeLogs', () => {
  it('returns zeros for an empty list', () => {
    expect(summarizeLogs([])).toEqual({ errors: 0, warnings: 0, info: 0, debug: 0 });
  });

  it('buckets entries on ZoneMinder\'s scale (0=INF, -1=WAR, -2=ERR, -3=FAT, -4=PNC, 1+=DBG)', () => {
    const logs = [
      makeLog({ level: -4, code: 'PNC' }),
      makeLog({ level: -3, code: 'FAT' }),
      makeLog({ level: -2, code: 'ERR' }),
      makeLog({ level: -1, code: 'WAR' }),
      makeLog({ level: 0, code: 'INF' }),
      makeLog({ level: 1, code: 'DBG' }),
      makeLog({ level: 3, code: 'DBG' }),
    ];
    expect(summarizeLogs(logs)).toEqual({ errors: 3, warnings: 1, info: 1, debug: 2 });
  });
});

describe('matchesLevel', () => {
  it('matches everything when no level is picked', () => {
    expect(matchesLevel(makeLog({ level: -2 }), undefined)).toBe(true);
  });

  it('matches the exact level for INFO and more severe', () => {
    expect(matchesLevel(makeLog({ level: -1 }), -1)).toBe(true);
    expect(matchesLevel(makeLog({ level: 0 }), -1)).toBe(false);
    expect(matchesLevel(makeLog({ level: -2 }), -1)).toBe(false);
  });

  it('treats DEBUG as every debug depth', () => {
    expect(matchesLevel(makeLog({ level: 1 }), 1)).toBe(true);
    expect(matchesLevel(makeLog({ level: 5 }), 1)).toBe(true);
    expect(matchesLevel(makeLog({ level: 0 }), 1)).toBe(false);
  });
});

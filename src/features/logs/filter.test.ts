import { describe, expect, it } from 'vitest';
import type { LogEntry } from '@/api/logs';
import { dateInputToUnix, parseLogTime, summarizeLogs } from './filter';

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

// The message search, the date range and the severity threshold are all
// query params now (zm-api#21), so the only thing left here is the
// conversion the toolbar needs to build them.
describe('dateInputToUnix', () => {
  it('returns null for empty input', () => {
    expect(dateInputToUnix('')).toBeNull();
  });

  it('returns null for unparseable input', () => {
    expect(dateInputToUnix('not-a-date')).toBeNull();
  });

  it('converts a datetime-local value to whole Unix seconds', () => {
    expect(dateInputToUnix('2026-06-01T10:30:00Z')).toBe(Date.UTC(2026, 5, 1, 10, 30) / 1000);
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

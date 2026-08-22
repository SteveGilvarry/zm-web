import { describe, expect, it } from 'vitest';
import { makeDateTimeFormatters, toDate, viewerTimeZone } from './datetime';

const iso = '2026-08-21T04:05:06Z';

describe('toDate', () => {
  it('accepts ISO strings, epochs and Dates; rejects junk', () => {
    expect(toDate(iso)?.toISOString()).toBe('2026-08-21T04:05:06.000Z');
    expect(toDate(0)?.toISOString()).toBe('1970-01-01T00:00:00.000Z');
    expect(toDate(new Date(iso))?.toISOString()).toBe('2026-08-21T04:05:06.000Z');
    expect(toDate(null)).toBeNull();
    expect(toDate('')).toBeNull();
    expect(toDate('not a date')).toBeNull();
  });
});

describe('makeDateTimeFormatters', () => {
  it('uses the ZoneMinder patterns when they are set', () => {
    const f = makeDateTimeFormatters({
      datePattern: '%Y-%m-%d',
      timePattern: '%H:%M',
      dateTimePattern: '%Y-%m-%d %H:%M:%S',
      timeZone: 'UTC',
      locale: 'en-GB',
    });
    expect(f.formatDate(iso)).toBe('2026-08-21');
    expect(f.formatTime(iso)).toBe('04:05');
    expect(f.formatDateTime(iso)).toBe('2026-08-21 04:05:06');
  });

  it('renders in the configured server zone', () => {
    const f = makeDateTimeFormatters({
      dateTimePattern: '%Y-%m-%d %H:%M',
      timeZone: 'Australia/Brisbane',
      locale: 'en-GB',
    });
    expect(f.formatDateTime(iso)).toBe('2026-08-21 14:05');
  });

  it('falls back to locale formatting when no pattern is configured', () => {
    const f = makeDateTimeFormatters({ timeZone: 'UTC', locale: 'en-GB' });
    // Exact punctuation is ICU's business; assert the pieces are there.
    expect(f.formatDate(iso)).toMatch(/2026/);
    expect(f.formatDate(iso)).toMatch(/Aug/i);
    expect(f.formatTime(iso)).toMatch(/^04:05:06$/);
  });

  it('ignores a blank or whitespace pattern and a blank zone', () => {
    const f = makeDateTimeFormatters({ datePattern: '   ', timeZone: '  ', locale: 'en-GB' });
    expect(f.timeZone).toBeUndefined();
    expect(f.formatDate(iso)).toMatch(/2026/);
  });

  it('returns an empty string for missing values', () => {
    const f = makeDateTimeFormatters({ locale: 'en-GB' });
    expect(f.formatDate(null)).toBe('');
    expect(f.formatDateTime(undefined)).toBe('');
    expect(f.formatTime('nonsense')).toBe('');
  });

  it('flags when the server zone differs from the viewer’s', () => {
    const viewer = viewerTimeZone();
    expect(makeDateTimeFormatters({ locale: 'en-GB' }).showsServerZone).toBe(false);
    expect(makeDateTimeFormatters({ timeZone: viewer, locale: 'en-GB' }).showsServerZone).toBe(false);
    const elsewhere = viewer === 'Pacific/Kiritimati' ? 'UTC' : 'Pacific/Kiritimati';
    expect(makeDateTimeFormatters({ timeZone: elsewhere, locale: 'en-GB' }).showsServerZone).toBe(true);
  });
});

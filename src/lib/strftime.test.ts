import { describe, expect, it } from 'vitest';
import { isStrftimePattern, strftime } from './strftime';

// 2026-08-21T04:05:06Z — a Friday. Pinned zone so the test is stable
// wherever it runs (the suite has no TZ= in its scripts).
const d = new Date('2026-08-21T04:05:06Z');
const utc = { timeZone: 'UTC', locale: 'en-GB' } as const;

describe('strftime', () => {
  it('formats the directives ZoneMinder patterns use', () => {
    expect(strftime('%Y-%m-%d %H:%M:%S', d, utc)).toBe('2026-08-21 04:05:06');
    expect(strftime('%a %d %b %Y', d, utc)).toBe('Fri 21 Aug 2026');
    expect(strftime('%A %d %B, %Y', d, utc)).toBe('Friday 21 August, 2026');
    expect(strftime('%y', d, utc)).toBe('26');
    expect(strftime('%j', d, utc)).toBe('233');
  });

  it('expands composite directives', () => {
    expect(strftime('%F %T', d, utc)).toBe('2026-08-21 04:05:06');
    expect(strftime('%D', d, utc)).toBe('08/21/26');
    expect(strftime('%R', d, utc)).toBe('04:05');
  });

  it('renders 12-hour time with the day period', () => {
    expect(strftime('%I:%M %p', d, utc)).toMatch(/^04:05 AM$/i);
  });

  it('honours the requested time zone', () => {
    // UTC+10 in August (no DST in Queensland).
    expect(strftime('%Y-%m-%d %H:%M', d, { timeZone: 'Australia/Brisbane', locale: 'en-GB' }))
      .toBe('2026-08-21 14:05');
    // Midnight must render as 00, not 24.
    const midnight = new Date('2026-08-21T00:00:00Z');
    expect(strftime('%H:%M', midnight, utc)).toBe('00:00');
  });

  it('localises month and day names', () => {
    expect(strftime('%B', d, { timeZone: 'UTC', locale: 'de-DE' })).toBe('August');
    expect(strftime('%A', d, { timeZone: 'UTC', locale: 'fr-FR' })).toBe('vendredi');
  });

  it('leaves directives it does not know alone and escapes %%', () => {
    expect(strftime('100%% of %Q', d, utc)).toBe('100% of %Q');
  });

  it('returns an empty string for an invalid date', () => {
    expect(strftime('%Y', new Date('nope'), utc)).toBe('');
  });
});

describe('isStrftimePattern', () => {
  it('accepts real patterns and rejects blanks', () => {
    expect(isStrftimePattern('%Y-%m-%d')).toBe(true);
    expect(isStrftimePattern('')).toBe(false);
    expect(isStrftimePattern('   ')).toBe(false);
    expect(isStrftimePattern(null)).toBe(false);
    expect(isStrftimePattern('no directives')).toBe(false);
  });
});

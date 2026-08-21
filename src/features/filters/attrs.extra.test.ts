/**
 * attrs — the relative-date grammar ZoneMinder inherits from strtotime.
 * Every unit the parser knows has to resolve against `now`, in UTC, because
 * zm_api stamps server-local DATETIMEs with `Z`.
 */
import { describe, expect, it } from 'vitest';
import { resolveDateValue, toRfc3339 } from './attrs';

const now = new Date('2026-05-24T12:00:00Z');
const at = (v: string) => {
  const ms = resolveDateValue(v, now);
  return ms == null ? null : new Date(ms).toISOString();
};

describe('resolveDateValue — relative expressions', () => {
  it.each([
    ['-30 seconds', '2026-05-24T11:59:30.000Z'],
    ['+30 sec',     '2026-05-24T12:00:30.000Z'],
    ['-15 minutes', '2026-05-24T11:45:00.000Z'],
    ['5 min',       '2026-05-24T12:05:00.000Z'],
    ['-2 hours',    '2026-05-24T10:00:00.000Z'],
    ['-1 day',      '2026-05-23T12:00:00.000Z'],
    ['-1 week',     '2026-05-17T12:00:00.000Z'],
    ['+2 weeks',    '2026-06-07T12:00:00.000Z'],
    ['-1 month',    '2026-04-24T12:00:00.000Z'],
    ['+1 year',     '2027-05-24T12:00:00.000Z'],
  ])('%s resolves against now', (expr, expected) => {
    expect(at(expr)).toBe(expected);
  });

  it('"N units ago" flips the sign', () => {
    expect(at('2 hours ago')).toBe('2026-05-24T10:00:00.000Z');
    expect(at('1 day ago')).toBe('2026-05-23T12:00:00.000Z');
  });

  it('"now" is the clock itself', () => {
    expect(at('now')).toBe('2026-05-24T12:00:00.000Z');
    expect(at('NOW')).toBe('2026-05-24T12:00:00.000Z');
  });

  it('an empty or unrecognised value resolves to nothing', () => {
    expect(resolveDateValue('', now)).toBeNull();
    expect(resolveDateValue('   ', now)).toBeNull();
    expect(resolveDateValue('next tuesday', now)).toBeNull();
    expect(resolveDateValue('-1 fortnight', now)).toBeNull();
  });

  it('absolute values win over the relative grammar', () => {
    expect(at('2026-01-02 03:04:05')).toBe('2026-01-02T03:04:05.000Z');
    expect(at('2026-01-02')).toBe('2026-01-02T00:00:00.000Z');
  });
});

describe('toRfc3339', () => {
  it('stamps a zoneless value Z and keeps an explicit zone', () => {
    expect(toRfc3339('2026-01-02 03:04')).toBe('2026-01-02T03:04:00Z');
    expect(toRfc3339('2026-01-02T03:04:05')).toBe('2026-01-02T03:04:05Z');
    expect(toRfc3339('2026-01-02T03:04:05+02:00')).toBe('2026-01-02T03:04:05+02:00');
  });

  it('refuses anything that is not an absolute datetime', () => {
    expect(toRfc3339('-1 day')).toBeNull();
    expect(toRfc3339('')).toBeNull();
  });
});

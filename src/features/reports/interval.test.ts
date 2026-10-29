import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { formatInterval } from './interval';

const t = i18n.t.bind(i18n);

describe('formatInterval', () => {
  it('reads seconds in the largest whole unit', () => {
    expect(formatInterval(t, 86400)).toMatch(/^1 day/);
    expect(formatInterval(t, 7 * 86400)).toMatch(/^7 day/);
    expect(formatInterval(t, 7200)).toBe('2 h');
    expect(formatInterval(t, 900)).toBe('15 min');
    expect(formatInterval(t, 45)).toBe('45 s');
    expect(formatInterval(t, 0)).toBe('0 s');
  });

  it('calls a null interval one-off', () => {
    expect(formatInterval(t, null)).toBe('one-off');
    expect(formatInterval(t, undefined)).toBe('one-off');
  });
});

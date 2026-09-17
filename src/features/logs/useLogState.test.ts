/**
 * `logState()` (functions.php:1648): which counts turn the navbar's Log item
 * amber and which turn it red.
 */
import { describe, expect, it } from 'vitest';
import { logStateFrom, type LogStateThresholds } from './useLogState';

const ZM_DEFAULTS: LogStateThresholds = {
  alertFatal: 0, alarmFatal: 1,
  alertError: 1, alarmError: 10,
  alertWarning: 1, alarmWarning: 100,
};

const counts = (over: Partial<{ fatal: number; error: number; warning: number }> = {}) =>
  ({ fatal: 0, error: 0, warning: 0, ...over });

describe('logStateFrom', () => {
  it('is ok on an empty log', () => {
    expect(logStateFrom(counts(), ZM_DEFAULTS)).toBe('ok');
  });

  it('alerts on a single error or warning', () => {
    expect(logStateFrom(counts({ error: 1 }), ZM_DEFAULTS)).toBe('alert');
    expect(logStateFrom(counts({ warning: 1 }), ZM_DEFAULTS)).toBe('alert');
  });

  it('alarms on one fatal, ZoneMinder\'s default', () => {
    expect(logStateFrom(counts({ fatal: 1 }), ZM_DEFAULTS)).toBe('alarm');
  });

  it('alarms once errors reach their alarm count', () => {
    expect(logStateFrom(counts({ error: 9 }), ZM_DEFAULTS)).toBe('alert');
    expect(logStateFrom(counts({ error: 10 }), ZM_DEFAULTS)).toBe('alarm');
  });

  it('lets the most severe level win, as legacy breaks out of the loop', () => {
    expect(logStateFrom(counts({ fatal: 1, warning: 5 }), ZM_DEFAULTS)).toBe('alarm');
  });

  it('ignores a level whose threshold is zero', () => {
    const off: LogStateThresholds = { ...ZM_DEFAULTS, alarmError: 0, alertError: 0 };
    expect(logStateFrom(counts({ error: 500 }), off)).toBe('ok');
  });
});

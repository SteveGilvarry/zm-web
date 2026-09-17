/**
 * The watch page's cycle period list — watch.php:340-360 offers six values
 * and adds `ZM_WEB_REFRESH_CYCLE` when it is not already one of them.
 */
import { describe, expect, it } from 'vitest';
import { watchCyclePeriods, WATCH_CYCLE_PERIODS } from './useWatchCycle';

describe('watchCyclePeriods', () => {
  it('offers the six legacy periods', () => {
    expect(watchCyclePeriods(30)).toEqual([...WATCH_CYCLE_PERIODS]);
    expect(WATCH_CYCLE_PERIODS).toEqual([5, 10, 30, 60, 120, 300]);
  });

  it('appends a configured refresh cycle that is not already listed', () => {
    expect(watchCyclePeriods(45)).toEqual([5, 10, 30, 60, 120, 300, 45]);
  });

  it('ignores an unset or nonsensical config value', () => {
    expect(watchCyclePeriods(0)).toEqual([...WATCH_CYCLE_PERIODS]);
    expect(watchCyclePeriods(-1)).toEqual([...WATCH_CYCLE_PERIODS]);
  });
});

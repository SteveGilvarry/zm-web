import { describe, expect, it } from 'vitest';
import {
  eventDurationSeconds,
  formatDuration,
  sumEventDurations,
  sumEventDiskSpace,
} from './duration';

describe('eventDurationSeconds', () => {
  it('returns 0 for null / undefined / NaN / negative', () => {
    expect(eventDurationSeconds(null)).toBe(0);
    expect(eventDurationSeconds(undefined)).toBe(0);
    expect(eventDurationSeconds(-3)).toBe(0);
    expect(eventDurationSeconds(NaN)).toBe(0);
  });

  it('rounds decimal seconds to the nearest integer', () => {
    expect(eventDurationSeconds(12.341)).toBe(12);
    expect(eventDurationSeconds(12.6)).toBe(13);
  });

  it('parses string-encoded lengths from the API', () => {
    expect(eventDurationSeconds('30.5')).toBe(31);
  });
});

describe('formatDuration', () => {
  it('formats sub-hour spans as M:SS', () => {
    expect(formatDuration(45)).toBe('0:45');
    expect(formatDuration(125)).toBe('2:05');
  });

  it('formats multi-hour spans as H:MM:SS', () => {
    expect(formatDuration(3725)).toBe('1:02:05');
  });

  it('returns "0s" for zero / negative durations', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(-1)).toBe('0s');
  });
});

describe('sumEventDurations + sumEventDiskSpace', () => {
  it('sums Duration and DiskSpace columns across the visible page', () => {
    const page = [
      { length: 10, disk_space: 1024 },
      { length: 25, disk_space: 2048 },
      { length: null, disk_space: null },
      { length: 7,  disk_space: undefined },
    ];
    expect(sumEventDurations(page)).toBe(42);
    expect(sumEventDiskSpace(page)).toBe(3072);
  });
});

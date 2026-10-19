import { describe, expect, it } from 'vitest';
import { AUDIO_LEVEL_POLL_MS, levelMeterState, levelThresholdPercent } from './audioLevel';

describe('audio level meter state (js/LevelGraph.js)', () => {
  it('a missing reading says so instead of a confident zero', () => {
    expect(levelMeterState(null, true, 'no reading')).toEqual({ percent: 0, text: 'no reading', alarm: false });
    expect(levelMeterState(Number.NaN, false, 'x').text).toBe('x');
  });

  it('clamps and rounds onto 0-100', () => {
    expect(levelMeterState(140.2, true, '')).toEqual({ percent: 100, text: '100', alarm: true });
    expect(levelMeterState(-3, false, '')).toEqual({ percent: 0, text: '0', alarm: false });
    expect(levelMeterState(41.6, null, '').percent).toBe(42);
  });

  it('threshold 0 means detection is off, so no mark; above 100 pins to the end', () => {
    expect(levelThresholdPercent(0)).toBeNull();
    expect(levelThresholdPercent('')).toBeNull();
    expect(levelThresholdPercent('35')).toBe(35);
    expect(levelThresholdPercent(250)).toBe(100);
  });

  it('polls at two seconds, inside the box’s one-request-a-second limit', () => {
    expect(AUDIO_LEVEL_POLL_MS).toBe(2000);
  });
});

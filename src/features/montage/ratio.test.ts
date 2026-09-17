/**
 * Montage Ratio select, ported from legacy `montage.js` (`presetRatio`,
 * `setRatioForMonitor`, `calculateAverageMonitorsRatio`).
 */
import { describe, expect, it } from 'vitest';
import {
  MONTAGE_RATIOS, aspectRatioFor, averageRatio, longSideRatio, ratioValue,
} from './ratio';

describe('MONTAGE_RATIOS', () => {
  it('opens with legacy\'s two computed choices, then the presets in order', () => {
    expect(MONTAGE_RATIOS.slice(0, 5)).toEqual(['auto', 'real', '1:1', '5:4', '4:3']);
    expect(MONTAGE_RATIOS.at(-1)).toBe('11:4');
  });
});

describe('ratioValue', () => {
  it('parses `w:h`', () => {
    expect(ratioValue('16:9')).toBeCloseTo(1.778, 3);
    expect(ratioValue('1:1')).toBe(1);
  });

  it('rejects the computed names and junk', () => {
    expect(ratioValue('auto')).toBeNull();
    expect(ratioValue('real')).toBeNull();
    expect(ratioValue('16:0')).toBeNull();
  });
});

describe('longSideRatio', () => {
  it('reads the same for a camera and its portrait twin', () => {
    expect(longSideRatio({ width: 1920, height: 1080 })).toBeCloseTo(16 / 9, 5);
    expect(longSideRatio({ width: 1080, height: 1920 })).toBeCloseTo(16 / 9, 5);
  });

  it('falls back to square on a degenerate size', () => {
    expect(longSideRatio({ width: 0, height: 0 })).toBe(1);
  });
});

describe('averageRatio', () => {
  it('snaps the mean onto the nearest preset', () => {
    // 16:9 and 16:10 average to ~1.69, whose nearest preset is 5:3 (1.667).
    expect(averageRatio([
      { width: 1920, height: 1080 },
      { width: 1920, height: 1200 },
    ])).toBeCloseTo(5 / 3, 3);
  });

  it('defaults to 16:9 with nothing on screen', () => {
    expect(averageRatio([])).toBeCloseTo(16 / 9, 5);
  });
});

describe('aspectRatioFor', () => {
  const landscape = { width: 1920, height: 1080 };
  const portrait = { width: 1080, height: 1920 };

  it('gives a camera its own shape for `real`', () => {
    expect(aspectRatioFor('real', landscape, 16 / 9)).toBe('1920 / 1080');
  });

  it('uses the averaged ratio for `auto`', () => {
    expect(aspectRatioFor('auto', landscape, 1.5)).toBe('1.5 / 1');
  });

  it('keeps a portrait camera portrait', () => {
    expect(aspectRatioFor('16:9', portrait, 16 / 9)).toBe(`1 / ${16 / 9}`);
  });

  it('leaves the tile alone when the choice cannot be resolved', () => {
    expect(aspectRatioFor('nonsense', landscape, 16 / 9)).toBeUndefined();
    expect(aspectRatioFor('16:9', { width: 0, height: 0 }, 16 / 9)).toBeUndefined();
  });
});

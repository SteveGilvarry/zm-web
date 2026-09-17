import { describe, expect, it } from 'vitest';
import { averageArea, normalizeScale, reviewCanvasWidth } from './reviewScale';

describe('averageArea', () => {
  it('is 0 with no monitors', () => {
    expect(averageArea([])).toBe(0);
  });

  it('averages W*H over the displayed monitors', () => {
    expect(averageArea([
      { width: 640, height: 480 },
      { width: 1920, height: 1080 },
    ])).toBe((640 * 480 + 1920 * 1080) / 2);
  });
});

describe('normalizeScale', () => {
  it('is 1 when the monitor is exactly average', () => {
    const sizes = [{ width: 640, height: 480 }, { width: 640, height: 480 }];
    expect(normalizeScale(sizes[0], averageArea(sizes))).toBeCloseTo(1);
  });

  it('shrinks the big camera and grows the small one', () => {
    const sizes = [{ width: 640, height: 480 }, { width: 1920, height: 1080 }];
    const avg = averageArea(sizes);
    expect(normalizeScale(sizes[0], avg)).toBeGreaterThan(1);
    expect(normalizeScale(sizes[1], avg)).toBeLessThan(1);
  });

  it('falls back to 1 on a degenerate area', () => {
    expect(normalizeScale({ width: 0, height: 0 }, 100)).toBe(1);
    expect(normalizeScale({ width: 640, height: 480 }, 0)).toBe(1);
  });
});

describe('reviewCanvasWidth', () => {
  it('multiplies width by normalise, zoom and scale', () => {
    const size = { width: 1920, height: 1080 };
    const avg = averageArea([size]);
    expect(reviewCanvasWidth(size, avg, 0.5)).toBe(960);
    expect(reviewCanvasWidth(size, avg, 0.5, 2)).toBe(1920);
  });

  it('never goes below 120px', () => {
    expect(reviewCanvasWidth({ width: 320, height: 240 }, 320 * 240, 0.1)).toBe(120);
  });
});

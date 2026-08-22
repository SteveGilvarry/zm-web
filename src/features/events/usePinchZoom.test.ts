import { describe, expect, it } from 'vitest';
import { zoomAt, clampPan, PINCH_MAX, PINCH_MIN } from './usePinchZoom';

const at = (scale: number, x = 0, y = 0) => ({ scale, x, y });

describe('zoomAt', () => {
  it('keeps the point under the gesture where it was', () => {
    // Zooming 2× centred 100px right of centre: that point must not move.
    const next = zoomAt(at(1), 2, 100, 0);
    const before = 100; // distance of the point from the origin, unscaled
    const after = before * next.scale + next.x;
    expect(after).toBeCloseTo(100, 6);
  });

  it('snaps back to the identity transform at 1×', () => {
    expect(zoomAt(at(2, 40, -20), 1, 10, 10)).toEqual({ scale: 1, x: 0, y: 0 });
    // …and cannot be pushed below it.
    expect(zoomAt(at(2, 40, -20), 0.2, 10, 10)).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it('clamps to the zoom range', () => {
    expect(zoomAt(at(4), 99, 0, 0).scale).toBe(PINCH_MAX);
    expect(zoomAt(at(1), PINCH_MIN, 0, 0).scale).toBe(PINCH_MIN);
  });

  it('composes: two pinches to 2× match one to 4×', () => {
    const once = zoomAt(at(1), 4, 30, 12);
    const twice = zoomAt(zoomAt(at(1), 2, 30, 12), 4, 30, 12);
    expect(twice.scale).toBe(once.scale);
    expect(twice.x).toBeCloseTo(once.x, 6);
    expect(twice.y).toBeCloseTo(once.y, 6);
  });
});

describe('clampPan', () => {
  it('does not move anything at 1×', () => {
    expect(clampPan(at(1, 500, 500), 800, 450)).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it('stops the content being dragged off the frame', () => {
    const panned = clampPan(at(2, 5000, -5000), 800, 450);
    expect(panned.x).toBeLessThanOrEqual(800);
    expect(panned.y).toBeGreaterThanOrEqual(-450);
    expect(panned.scale).toBe(2);
  });

  it('leaves a pan inside the slack alone', () => {
    expect(clampPan(at(2, 20, -10), 800, 450)).toEqual({ scale: 2, x: 20, y: -10 });
  });
});

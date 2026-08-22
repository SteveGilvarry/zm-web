import { describe, expect, it } from 'vitest';
import { fitToBox } from './FitBox';

describe('fitToBox', () => {
  it('has nothing to say before the parent has been measured', () => {
    expect(fitToBox(0, 500, 1.78)).toBeNull();
    expect(fitToBox(500, 0, 1.78)).toBeNull();
    expect(fitToBox(500, 500, 0)).toBeNull();
  });

  it('fits a portrait recording to the height, not the width', () => {
    // 2160×3840 in a 700×600 cell: width-first would be 700 × 1244 and run
    // off the bottom of the page.
    const fit = fitToBox(700, 600, 2160 / 3840)!;
    expect(fit.height).toBeCloseTo(600, 5);
    expect(fit.width).toBeCloseTo(337.5, 1);
  });

  it('fits a landscape recording to the width', () => {
    const fit = fitToBox(700, 600, 16 / 9)!;
    expect(fit.width).toBeCloseTo(700, 5);
    expect(fit.height).toBeCloseTo(393.75, 1);
  });

  it('honours an explicit cap, and still fits the height', () => {
    const capped = fitToBox(2000, 900, 16 / 9, 640)!;
    expect(capped.width).toBe(640);
    expect(capped.height).toBeCloseTo(360, 5);

    // A cap wider than the space available does not win.
    const bounded = fitToBox(500, 900, 16 / 9, 1280)!;
    expect(bounded.width).toBe(500);
  });

  it('never returns a box larger than the space it was given', () => {
    for (const aspect of [0.3, 0.5625, 1, 1.78, 3]) {
      for (const [w, h] of [[300, 900], [900, 300], [640, 640]] as const) {
        const fit = fitToBox(w, h, aspect)!;
        expect(fit.width).toBeLessThanOrEqual(w + 0.001);
        expect(fit.height).toBeLessThanOrEqual(h + 0.001);
        expect(fit.width / fit.height).toBeCloseTo(aspect, 6);
      }
    }
  });
});

/**
 * `maxFit` — the port of legacy `maxfit2`. The properties asserted here are
 * the ones the legacy wall depends on: every tile lands inside the viewport,
 * no two overlap, the aspect of each camera survives, and the arrangement is
 * centred horizontally.
 */
import { describe, expect, it } from 'vitest';
import { maxFit, type FitPlacement } from './maxfit';

const hd = { width: 1920, height: 1080 };

function overlaps(a: FitPlacement, b: FitPlacement): boolean {
  return a.left < b.left + b.width && b.left < a.left + a.width
    && a.top < b.top + b.height && b.top < a.top + a.height;
}

describe('maxFit', () => {
  it('has nothing to say about an empty wall or an unmeasured viewport', () => {
    expect(maxFit([], 1000, 800)).toBeNull();
    expect(maxFit([hd], 0, 800)).toBeNull();
    expect(maxFit([hd], 1000, 0)).toBeNull();
  });

  it('gives a single camera the viewport, centred', () => {
    const [cell] = maxFit([hd], 1000, 800)!;
    expect(cell.top).toBe(0);
    expect(cell.width).toBeLessThan(1000);
    expect(cell.height).toBeLessThan(800);
    // 16:9 survives the fit (±1px from the integer rounding legacy also has).
    expect(cell.width / cell.height).toBeCloseTo(16 / 9, 1);
    expect(cell.left).toBeCloseTo((1000 - cell.width) / 2, 0);
  });

  it('packs nine cameras without overlap and inside the viewport', () => {
    const cells = maxFit(Array.from({ length: 9 }, () => hd), 1600, 900)!;
    expect(cells).toHaveLength(9);
    for (const c of cells) {
      expect(c.left).toBeGreaterThanOrEqual(0);
      expect(c.top).toBeGreaterThanOrEqual(0);
      expect(c.left + c.width).toBeLessThanOrEqual(1600);
      expect(c.top + c.height).toBeLessThanOrEqual(900);
    }
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        expect(overlaps(cells[i], cells[j])).toBe(false);
      }
    }
  });

  it('shrinks the tiles as the wall grows', () => {
    const four = maxFit(Array.from({ length: 4 }, () => hd), 1600, 900)!;
    const sixteen = maxFit(Array.from({ length: 16 }, () => hd), 1600, 900)!;
    expect(sixteen[0].width).toBeLessThan(four[0].width);
  });

  it('keeps a portrait camera portrait beside landscape ones', () => {
    const portrait = { width: 1080, height: 1920 };
    const cells = maxFit([hd, portrait, hd], 1600, 900)!;
    expect(cells[1].height).toBeGreaterThan(cells[1].width);
    expect(cells[0].height).toBeLessThan(cells[0].width);
  });

  it('counts the tile borders against the viewport', () => {
    const plain = maxFit([hd, hd], 1000, 600)!;
    const bordered = maxFit([hd, hd], 1000, 600, { width: 20, height: 20 })!;
    expect(bordered[0].width).toBeLessThan(plain[0].width);
  });

  it('returns null when even the smallest scale will not fit', () => {
    // 20 HD tiles at the 0.05 floor are ~96px wide each: far more than a
    // 100×50 viewport can hold.
    expect(maxFit(Array.from({ length: 20 }, () => hd), 100, 50)).toBeNull();
  });
});

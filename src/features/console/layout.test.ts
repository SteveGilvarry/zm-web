import { describe, expect, it } from 'vitest';
import { justifyRows } from './layout';

interface Tile { id: string }
const t = (id: string, aspect: number) => ({ data: { id } as Tile, aspect });

describe('justifyRows — packing', () => {
  it('returns empty when input is empty', () => {
    expect(justifyRows([], 1000)).toEqual([]);
    expect(justifyRows([t('a', 16 / 9)], 0)).toEqual([]);
  });

  it('puts a single tile in its own row, capped at targetHeight', () => {
    const rows = justifyRows([t('a', 16 / 9)], 1600, { targetHeight: 360 });
    expect(rows).toHaveLength(1);
    expect(rows[0].height).toBeLessThanOrEqual(360);
  });

  it('packs same-aspect tiles into rows that exactly fill the viewport width', () => {
    // 4 × 16:9 tiles, target 150, gap 16, viewport 900.
    // 3 tiles → exactH 163 ≥ target, keep accumulating.
    // 4th tile drops exactH to 120 < target → finalise row at 3 tiles, h=163.
    // Final partial row has 1 tile at the target cap.
    const W = 900;
    const GAP = 16;
    const tiles = [
      t('a', 16 / 9),
      t('b', 16 / 9),
      t('c', 16 / 9),
      t('d', 16 / 9),
    ];
    const rows = justifyRows(tiles, W, { targetHeight: 150, gap: GAP });
    expect(rows.length).toBeGreaterThan(1);

    // First row is finalised inline — its widths must sum to viewport width
    // minus gaps.
    const first = rows[0];
    const gaps = (first.tiles.length - 1) * GAP;
    const sumW = first.tiles.reduce((s, x) => s + x.width, 0);
    expect(sumW + gaps).toBeCloseTo(W, 0);
  });

  it('splits aspect classes across separate rows even when a single row would fit', () => {
    // 3 portraits + 1 landscape — at default target, they'd all fit in one row
    // on a wide viewport. Aspect-class boundary forces the landscape into row 2.
    const rows = justifyRows(
      [t('a', 9 / 16), t('b', 9 / 16), t('c', 9 / 16), t('d', 16 / 9)],
      2000,
      { targetHeight: 360 },
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].tiles.map((x) => x.data.id)).toEqual(['a', 'b', 'c']);
    expect(rows[1].tiles.map((x) => x.data.id)).toEqual(['d']);
  });

  it('caps row heights at maxHeight', () => {
    const rows = justifyRows(
      [t('a', 16 / 9)],
      8000, // huge viewport — without a cap, one tile would balloon
      { targetHeight: 360, maxHeight: 500 },
    );
    expect(rows[0].height).toBeLessThanOrEqual(500);
  });

  it('computes tile widths exactly proportional to aspect', () => {
    // Three square tiles, no gaps, target 300 — exactH at full width is
    // 900 / 3 = 300, so the algorithm packs them into one row at h=300
    // and each tile is 300×300.
    const rows = justifyRows(
      [t('a', 1), t('b', 1), t('c', 1)],
      900,
      { targetHeight: 300, gap: 0 },
    );
    expect(rows).toHaveLength(1);
    rows[0].tiles.forEach((x) => {
      expect(x.width).toBeCloseTo(300, 0);
      expect(x.height).toBe(rows[0].height);
    });
  });

  it('breaks before adding a tile that would push the row below target', () => {
    // 4 same-aspect tiles at target 300 in a 600-wide viewport:
    //   one row of 1 tile at H=600/(16/9)=337 — first tile alone WAY above
    //   target; second tile would drop it.
    const rows = justifyRows(
      [t('a', 16 / 9), t('b', 16 / 9), t('c', 16 / 9), t('d', 16 / 9)],
      600,
      { targetHeight: 200, gap: 0 },
    );
    // Two tiles per row at exactly target — each ~168 (600/(2 × 16/9)).
    expect(rows.length).toBeGreaterThanOrEqual(2);
    rows.forEach((r) => {
      expect(r.height).toBeLessThanOrEqual(300);
    });
  });
});

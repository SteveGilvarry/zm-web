import { describe, expect, it } from 'vitest';
import { justifyRows, packWall } from './layout';

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

describe('packWall', () => {
  const tile = (id: number, aspect: number) => ({ data: id, aspect });
  const wide = (n: number) => Array.from({ length: n }, (_, i) => tile(i, 16 / 9));

  it('returns nothing without tiles or width', () => {
    expect(packWall([], 1000, 700)).toEqual([]);
    expect(packWall(wide(4), 0, 700)).toEqual([]);
  });

  it('fills the available height rather than trailing off below it', () => {
    const rows = packWall(wide(4), 1000, 700, { gap: 16, ribbon: 58 });
    const total = rows.reduce((s, r) => s + r.height + 58, 0) + 16 * (rows.length - 1);
    expect(total).toBeLessThanOrEqual(700 + 0.5);
    // 4 × 16:9 in 1000×700 wants two rows of two, not one long strip.
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.tiles.length === 2)).toBe(true);
  });

  it('fills the width: each row of equal-aspect tiles spans it exactly', () => {
    const rows = packWall(wide(6), 1200, 2000, { gap: 10, ribbon: 0 });
    for (const row of rows) {
      const used = row.tiles.reduce((s, t) => s + t.width, 0) + 10 * (row.tiles.length - 1);
      expect(used).toBeCloseTo(1200, 5);
    }
  });

  it('adds rows as the fleet grows, keeping tiles as large as they can be', () => {
    const four = packWall(wide(4), 1200, 800, { gap: 16, ribbon: 58 });
    const sixteen = packWall(wide(16), 1200, 800, { gap: 16, ribbon: 58 });
    expect(sixteen.length).toBeGreaterThan(four.length);
    expect(sixteen[0].height).toBeLessThan(four[0].height);
  });

  it('shrinks to fit when even one row is too tall for the space', () => {
    // A single portrait tile at full width would be 1500px tall.
    const rows = packWall([tile(1, 2 / 3)], 1000, 400, { gap: 16, ribbon: 40 });
    expect(rows).toHaveLength(1);
    expect(rows[0].height).toBeLessThanOrEqual(360);
    expect(rows[0].tiles[0].width).toBeLessThan(1000);
  });

  it('does not count a row it has no room to draw', () => {
    // 12 cameras in a 1280×760 area: eleven rows of ribbon alone would eat
    // the screen, so the packer has to reject those candidates outright.
    const rows = packWall(wide(12), 1280, 760, { gap: 16, ribbon: 58 });
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.tiles.length === 4)).toBe(true);
    const total = rows.reduce((s, r) => s + r.height + 58, 0) + 16 * 2;
    expect(total).toBeLessThanOrEqual(760);
  });

  it('keeps every tile, in order, whatever the row count', () => {
    const rows = packWall(wide(7), 900, 600, { gap: 8, ribbon: 20 });
    expect(rows.flatMap((r) => r.tiles.map((t) => t.data))).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('balances mixed aspects across rows', () => {
    const mixed = [tile(1, 16 / 9), tile(2, 9 / 16), tile(3, 16 / 9), tile(4, 9 / 16)];
    const rows = packWall(mixed, 1000, 700, { gap: 16, ribbon: 58 });
    const heights = rows.map((r) => r.height);
    // No row may be more than twice as tall as another — that is what a
    // balanced split buys us.
    expect(Math.max(...heights) / Math.min(...heights)).toBeLessThan(2);
  });
});

describe('packWall row balance', () => {
  const tile = (id: number, aspect: number) => ({ data: id, aspect });

  it('splits three portraits and a landscape into two rows when that is bigger', () => {
    // The real dev-box fleet: three 9:16-ish cameras and one 16:9, in the
    // space the console actually measured (825 × 632).
    const fleet = [tile(1, 0.573), tile(2, 0.573), tile(3, 0.573), tile(4, 1.81)];
    const rows = packWall(fleet, 825, 632, { gap: 16, ribbon: 64 });
    expect(rows).toHaveLength(2);
    expect(rows[0].tiles).toHaveLength(3);
    expect(rows[1].tiles).toHaveLength(1);
    // Two rows only win by making the cameras bigger than one row would.
    expect(rows[0].height).toBeGreaterThan(220);
  });

  it('never leaves a row empty', () => {
    const fleet = [tile(1, 0.5), tile(2, 3), tile(3, 0.5)];
    for (let width = 400; width <= 2000; width += 400) {
      const rows = packWall(fleet, width, 900, { gap: 16, ribbon: 40 });
      expect(rows.every((r) => r.tiles.length > 0)).toBe(true);
      expect(rows.flatMap((r) => r.tiles)).toHaveLength(3);
    }
  });
});

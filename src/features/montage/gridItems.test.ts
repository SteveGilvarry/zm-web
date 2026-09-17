import { describe, expect, it } from 'vitest';
import {
  alignItems,
  GRIDSTACK_CELL_HEIGHT,
  measureItems,
  packItems,
  presetItems,
  reorderItems,
  resizeItem,
  sortItems,
} from './gridItems';
import { GRIDSTACK_COLUMNS, type GridStackItem } from './layoutFormat';

const at = (id: number, x: number, y: number, w: number, h = 100): GridStackItem =>
  ({ id: String(id), x, y, w, h });

describe('presetItems', () => {
  it('fills all 48 columns per row and wraps at the column count', () => {
    const items = presetItems([1, 2, 3, 4, 5], 2);
    expect(items.map((i) => [i.x, i.w])).toEqual([[0, 24], [24, 24], [0, 24], [24, 24], [0, 24]]);
    expect(items.map((i) => i.y)).toEqual([0, 0, 100, 100, 200]);
  });

  it('rounds the column edges for counts that do not divide 48', () => {
    const row = presetItems([1, 2, 3, 4, 5], 5);
    expect(row.reduce((s, i) => s + i.w, 0)).toBe(GRIDSTACK_COLUMNS);
    expect(row.every((i) => i.w >= 1)).toBe(true);
  });

  it('gives a single-wide preset the whole canvas', () => {
    expect(presetItems([7], 1)).toEqual([{ id: '7', x: 0, y: 0, w: 48, h: 100 }]);
  });
});

describe('packItems', () => {
  it('flows tiles left to right and wraps when the row is full', () => {
    const packed = packItems([at(1, 0, 0, 36), at(2, 0, 0, 24), at(3, 0, 0, 12)]);
    expect(packed.map((i) => [i.x, i.y])).toEqual([[0, 0], [0, 100], [24, 100]]);
  });

  it('clamps a width nobody could have meant', () => {
    expect(packItems([at(1, 0, 0, 0), at(2, 0, 0, 999)]).map((i) => i.w)).toEqual([1, 48]);
  });
});

describe('alignItems', () => {
  const saved = [at(1, 0, 0, 24, 461), at(2, 24, 0, 24, 461)];

  it('keeps the saved geometry, mixed sizes and all', () => {
    expect(alignItems([at(1, 0, 0, 12, 200), at(2, 12, 0, 36, 400)], [1, 2], 2))
      .toEqual([at(1, 0, 0, 12, 200), at(2, 12, 0, 36, 400)]);
  });

  it('drops monitors the wall no longer shows', () => {
    expect(alignItems(saved, [2], 1).map((i) => i.id)).toEqual(['2']);
  });

  it('packs cameras the layout never named onto rows underneath', () => {
    const out = alignItems(saved, [1, 2, 9], 2);
    expect(out.map((i) => i.id)).toEqual(['1', '2', '9']);
    const tail = out[2];
    expect(tail.x).toBe(0);
    expect(tail.y).toBeGreaterThanOrEqual(461);
  });
});

describe('resizeItem / reorderItems', () => {
  it('widens one tile and pushes the rest along', () => {
    const out = resizeItem([at(1, 0, 0, 24), at(2, 24, 0, 24)], 1, 36);
    expect(out.map((i) => [i.id, i.x, i.y, i.w])).toEqual([['1', 0, 0, 36], ['2', 0, 100, 24]]);
  });

  it('leaves the items alone for a monitor it does not hold', () => {
    const items = [at(1, 0, 0, 48)];
    expect(resizeItem(items, 99, 12)).toBe(items);
    expect(reorderItems(items, 1, 1)).toBe(items);
    expect(reorderItems(items, 1, 99)).toBe(items);
  });

  it('moves a tile to another tile\'s place and repacks', () => {
    const out = reorderItems([at(1, 0, 0, 16), at(2, 16, 0, 16), at(3, 32, 0, 16)], 3, 1);
    expect(out.map((i) => i.id)).toEqual(['3', '1', '2']);
    expect(out.map((i) => i.x)).toEqual([0, 16, 32]);
  });
});

describe('sortItems', () => {
  it('reads the wall by row, then by column', () => {
    expect(sortItems([at(3, 0, 10, 24), at(2, 24, 0, 24), at(1, 0, 0, 24)]).map((i) => i.id))
      .toEqual(['1', '2', '3']);
  });
});

describe('measureItems', () => {
  /** A wall with two tiles, the second twice as tall as the first. */
  function wall(): HTMLElement {
    const container = document.createElement('div');
    const rect = (top: number, height: number) => () =>
      ({ top, height, left: 0, right: 0, bottom: top + height, width: 400, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
    container.getBoundingClientRect = rect(0, 800);
    for (const [id, top, height] of [['1', 0, 400], ['2', 400, 200]] as const) {
      const tile = document.createElement('div');
      tile.setAttribute('data-gs-id', id);
      tile.getBoundingClientRect = rect(top, height);
      container.append(tile);
    }
    return container;
  }

  it('reads y and h back in gridstack\'s 4 px rows', () => {
    const out = measureItems(wall(), [at(1, 0, 0, 24), at(2, 0, 0, 24)]);
    expect(out).toEqual([
      { id: '1', x: 0, y: 0, w: 24, h: 400 / GRIDSTACK_CELL_HEIGHT },
      { id: '2', x: 0, y: 400 / GRIDSTACK_CELL_HEIGHT, w: 24, h: 200 / GRIDSTACK_CELL_HEIGHT },
    ]);
  });

  it('keeps the nominal geometry where there is nothing to measure', () => {
    const items = [at(1, 0, 0, 24)];
    expect(measureItems(null, items)).toBe(items);
    // jsdom without stubbed rects reports a zero-height wall.
    expect(measureItems(document.createElement('div'), items)).toBe(items);
    // A tile the wall is not rendering keeps what it had.
    expect(measureItems(wall(), [at(8, 0, 0, 24)])).toEqual([at(8, 0, 0, 24)]);
  });
});

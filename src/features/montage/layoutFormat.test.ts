import { describe, expect, it } from 'vitest';
import { leaf, leafMonitors, split } from './mosaic';
import {
  GRIDSTACK_COLUMNS,
  gridStackToTree,
  parsePositions,
  serialiseGridStackPositions,
  serialisePositions,
  statusPositionFromLegacy,
  treeToGridStack,
} from './layoutFormat';

/** The real "Test1" row on the dev box, byte-for-byte (CRLF + 2-space indent). */
const TEST1 = '{\r\n  "gridStack": [\r\n    {\r\n      "w": 24,\r\n      "h": 461,\r\n      "id": "1",\r\n      "x": 0,\r\n      "y": 0\r\n    },\r\n    {\r\n      "w": 24,\r\n      "h": 461,\r\n      "id": "2",\r\n      "x": 24,\r\n      "y": 0\r\n    },\r\n    {\r\n      "y": 461,\r\n      "w": 24,\r\n      "h": 461,\r\n      "id": "3",\r\n      "x": 0\r\n    },\r\n    {\r\n      "y": 461,\r\n      "w": 24,\r\n      "h": 150,\r\n      "id": "4",\r\n      "x": 24\r\n    }\r\n  ],\r\n  "monitorStatusPosition": "outsideImgBottom",\r\n  "monitorRatio": {\r\n    "1": "auto",\r\n    "2": "auto",\r\n    "3": "auto",\r\n    "4": "auto"\r\n  }\r\n}';

describe('parsePositions — legacy gridstack rows', () => {
  it('reads the dev-box "Test1" layout as a 2×2 column-of-rows tree', () => {
    const parsed = parsePositions(TEST1);
    expect(parsed?.source).toBe('gridstack');
    expect(parsed?.statusPosition).toBe('outside');
    const tree = parsed!.tree;
    expect(tree.type).toBe('split');
    if (tree.type !== 'split') return;
    expect(tree.direction).toBe('column');
    expect(tree.children).toHaveLength(2);
    expect(leafMonitors(tree)).toEqual([1, 2, 3, 4]);
    // Row shares follow the tallest item per row (461 vs 461 → equal).
    expect(tree.sizes[0]).toBeCloseTo(0.5);
  });

  it('orders cells within a row by x regardless of item order', () => {
    const tree = gridStackToTree([
      { id: '9', x: 24, y: 0, w: 24, h: 10 },
      { id: '5', x: 0, y: 0, w: 24, h: 10 },
    ]);
    expect(leafMonitors(tree!)).toEqual([5, 9]);
  });

  it('uses w for column shares', () => {
    const tree = gridStackToTree([
      { id: '1', x: 0, y: 0, w: 36, h: 10 },
      { id: '2', x: 36, y: 0, w: 12, h: 10 },
    ]);
    expect(tree?.type).toBe('split');
    if (tree?.type !== 'split') return;
    expect(tree.sizes[0]).toBeCloseTo(0.75);
    expect(tree.sizes[1]).toBeCloseTo(0.25);
  });

  it('accepts the pre-2024 flat [{monitor_id,x,y,w,h}] form', () => {
    const parsed = parsePositions('[{"monitor_id":1,"x":0,"y":0,"w":4,"h":4},{"monitor_id":2,"x":4,"y":0,"w":4,"h":4}]');
    expect(parsed?.source).toBe('gridstack');
    expect(leafMonitors(parsed!.tree)).toEqual([1, 2]);
  });

  it('returns null for preset rows, junk and empty grids', () => {
    expect(parsePositions(null)).toBeNull();
    expect(parsePositions('')).toBeNull();
    expect(parsePositions('not json')).toBeNull();
    expect(parsePositions('{"gridStack":[]}')).toBeNull();
    expect(parsePositions('{"something":1}')).toBeNull();
  });
});

describe('parsePositions — tile geometry', () => {
  it('keeps the dev-box tile sizes instead of flattening them to an even grid', () => {
    expect(parsePositions(TEST1)?.items).toEqual([
      { id: '1', x: 0, y: 0, w: 24, h: 461 },
      { id: '2', x: 24, y: 0, w: 24, h: 461 },
      { id: '3', x: 0, y: 461, w: 24, h: 461 },
      { id: '4', x: 24, y: 461, w: 24, h: 150 },
    ]);
  });

  it('round-trips a legacy row byte-for-identical through the classic save path', () => {
    const items = parsePositions(TEST1)!.items;
    const again = parsePositions(serialiseGridStackPositions(items, 'outside'))!;
    expect(again.items).toEqual(items);
    expect(JSON.parse(serialiseGridStackPositions(items, 'outside')).gridStack).toEqual(items);
  });

  it('prefers the saved gridStack over the tree even when our own key wins', () => {
    // A row this dashboard wrote: `dashboard` decides the tree, `gridStack`
    // still decides the tile sizes, so a hand-resized wall survives a reload.
    const mixed = JSON.stringify({
      gridStack: [{ id: '1', x: 0, y: 0, w: 36, h: 400 }, { id: '2', x: 36, y: 0, w: 12, h: 400 }],
      dashboard: { version: 1, tree: split('row', [leaf(1), leaf(2)], [0.75, 0.25]) },
    });
    const parsed = parsePositions(mixed)!;
    expect(parsed.source).toBe('dashboard');
    expect(parsed.items.map((i) => i.w)).toEqual([36, 12]);
  });

  it('projects the tree when a row has no gridStack of its own', () => {
    const parsed = parsePositions(JSON.stringify({ version: 1, tree: split('row', [leaf(1), leaf(2)]) }))!;
    expect(parsed.items.map((i) => [i.x, i.w])).toEqual([[0, 24], [24, 24]]);
  });
});

describe('serialiseGridStackPositions', () => {
  it('writes exactly what legacy\'s objGridStack.save(false, false) writes', () => {
    const items = [
      { id: '4', x: 0, y: 0, w: 48, h: 550 },
      { id: '2', x: 0, y: 550, w: 24, h: 450 },
      { id: '3', x: 24, y: 550, w: 24, h: 450 },
    ];
    const obj = JSON.parse(serialiseGridStackPositions(items, 'inside', { 2: '16:9' }));
    expect(obj.gridStack).toEqual(items);
    expect(obj.monitorStatusPosition).toBe('insideImgBottom');
    expect(obj.monitorRatio).toEqual({ '4': 'auto', '2': '16:9', '3': 'auto' });
    // The modern mosaic reads the same arrangement from `dashboard`.
    expect(leafMonitors(obj.dashboard.tree)).toEqual([4, 2, 3]);
  });

  it('writes a gridStack with no tree when there is nothing to lay out', () => {
    const obj = JSON.parse(serialiseGridStackPositions([], 'hidden'));
    expect(obj.gridStack).toEqual([]);
    expect(obj.dashboard).toBeUndefined();
  });
});

describe('parsePositions — dashboard rows', () => {
  const tree = split('row', [leaf(1), split('column', [leaf(2), leaf(null)])], [0.7, 0.3]);

  it('prefers the exact tree under `dashboard` over the gridStack projection', () => {
    const parsed = parsePositions(serialisePositions(tree, 'hidden'));
    expect(parsed?.source).toBe('dashboard');
    expect(parsed?.tree).toEqual(tree);
    expect(parsed?.statusPosition).toBe('hidden');
  });

  it('still reads rows from the earlier dashboard format {version, tree}', () => {
    const parsed = parsePositions(JSON.stringify({ version: 1, tree }));
    expect(parsed?.source).toBe('dashboard');
    expect(parsed?.tree).toEqual(tree);
  });
});

describe('monitorRatio — the per-tile Ratio select', () => {
  it('reads the ratios legacy wrote', () => {
    const parsed = parsePositions(TEST1);
    expect(parsed?.monitorRatio).toEqual({ 1: 'auto', 2: 'auto', 3: 'auto', 4: 'auto' });
  });

  it('writes the ratios it was given and defaults the rest to auto', () => {
    const tree = split('row', [leaf(1), leaf(2)], [0.5, 0.5]);
    const obj = JSON.parse(serialisePositions(tree, 'inside', { 1: '16:9' }));
    expect(obj.monitorRatio).toEqual({ '1': '16:9', '2': 'auto' });
    expect(parsePositions(JSON.stringify(obj))?.monitorRatio).toEqual({ 1: '16:9', 2: 'auto' });
  });

  it('drops junk entries rather than trusting the column', () => {
    const obj = { gridStack: [{ id: '1', x: 0, y: 0, w: 48, h: 1000 }], monitorRatio: { x: '16:9', 2: 7 } };
    expect(parsePositions(JSON.stringify(obj))?.monitorRatio).toBeUndefined();
  });
});

describe('serialisePositions — what legacy sees', () => {
  it('writes a gridStack on the 48-column canvas, a status position and ratios, skipping vacant cells', () => {
    const tree = split('row', [leaf(1), split('column', [leaf(2), leaf(null)])], [0.5, 0.5]);
    const obj = JSON.parse(serialisePositions(tree, 'inside'));
    expect(obj.monitorStatusPosition).toBe('insideImgBottom');
    expect(obj.monitorRatio).toEqual({ '1': 'auto', '2': 'auto' });
    expect(obj.gridStack).toEqual([
      { id: '1', x: 0, y: 0, w: 24, h: 1000 },
      { id: '2', x: 24, y: 0, w: 24, h: 500 },
    ]);
    expect(obj.dashboard).toEqual({ version: 1, tree });
  });

  it('tiles the full width with no gaps for uneven thirds', () => {
    const items = treeToGridStack(split('row', [leaf(1), leaf(2), leaf(3)]));
    expect(items.map((i) => i.x)).toEqual([0, 16, 32]);
    expect(items.reduce((s, i) => s + i.w, 0)).toBe(GRIDSTACK_COLUMNS);
  });

  it('round-trips through the gridStack projection for grid-shaped trees', () => {
    const tree = split('column', [
      split('row', [leaf(1), leaf(2)]),
      split('row', [leaf(3), leaf(4)]),
    ]);
    const back = gridStackToTree(treeToGridStack(tree));
    expect(leafMonitors(back!)).toEqual([1, 2, 3, 4]);
  });
});

describe('statusPositionFromLegacy', () => {
  it('maps the four legacy values and rejects others', () => {
    expect(statusPositionFromLegacy('insideImgBottom')).toBe('inside');
    expect(statusPositionFromLegacy('showOnHover')).toBe('hover');
    expect(statusPositionFromLegacy('outsideImgBottom')).toBe('outside');
    expect(statusPositionFromLegacy('hidden')).toBe('hidden');
    expect(statusPositionFromLegacy('nope')).toBeUndefined();
  });

  it('writes showOnHover back for the hover position', () => {
    expect(JSON.parse(serialisePositions(leaf(1), 'hover')).monitorStatusPosition).toBe('showOnHover');
  });
});

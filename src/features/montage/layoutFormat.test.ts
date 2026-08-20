import { describe, expect, it } from 'vitest';
import { leaf, leafMonitors, split } from './mosaic';
import {
  GRIDSTACK_COLUMNS,
  gridStackToTree,
  parsePositions,
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
  it('maps the four legacy values (hover collapses to inside) and rejects others', () => {
    expect(statusPositionFromLegacy('insideImgBottom')).toBe('inside');
    expect(statusPositionFromLegacy('showOnHover')).toBe('inside');
    expect(statusPositionFromLegacy('outsideImgBottom')).toBe('outside');
    expect(statusPositionFromLegacy('hidden')).toBe('hidden');
    expect(statusPositionFromLegacy('nope')).toBeUndefined();
  });
});

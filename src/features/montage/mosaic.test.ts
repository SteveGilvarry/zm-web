import { describe, expect, it } from 'vitest';
import {
  bannerLayout,
  gridLayout,
  leaf,
  leafCount,
  leafMonitors,
  moveLeafTo,
  nodeAt,
  pipLayout,
  removeAt,
  resizeAt,
  setMonitorAt,
  split,
  splitAt,
} from './mosaic';

describe('mosaic — basic tree operations', () => {
  it('builds a single leaf', () => {
    const t = leaf(1);
    expect(t.type).toBe('leaf');
    expect(leafCount(t)).toBe(1);
    expect(leafMonitors(t)).toEqual([1]);
  });

  it('builds an N-way split with equal sizes by default', () => {
    const t = split('row', [leaf(1), leaf(2), leaf(3)]);
    expect(t.sizes).toEqual([1 / 3, 1 / 3, 1 / 3]);
  });

  it('nodeAt walks paths', () => {
    const t = split('column', [leaf(1), split('row', [leaf(2), leaf(3)])]);
    expect(nodeAt(t, [])).toBe(t);
    expect(nodeAt(t, [0])).toEqual(leaf(1));
    expect(nodeAt(t, [1, 1])).toEqual(leaf(3));
    expect(nodeAt(t, [9])).toBeNull();
  });
});

describe('mosaic — splitAt', () => {
  it('wraps a leaf in a 2-child split', () => {
    const before = leaf(1);
    const after = splitAt(before, [], 'row', 2);
    expect(after.type).toBe('split');
    expect(leafMonitors(after)).toEqual([1, 2]);
  });

  it('appends to an existing split when direction matches', () => {
    const before = split('row', [leaf(1), leaf(2)]);
    const after = splitAt(before, [], 'row', 3);
    expect(leafMonitors(after)).toEqual([1, 2, 3]);
    // Now equal-thirds, not preserving prior 1/2 + 1/2.
    expect((after as { sizes: number[] }).sizes).toEqual([1 / 3, 1 / 3, 1 / 3]);
  });

  it('nests when directions differ', () => {
    const before = split('row', [leaf(1), leaf(2)]);
    const after = splitAt(before, [0], 'column', 3);
    // Path [0] was a leaf inside a row; new split should nest there.
    expect(nodeAt(after, [0])).toEqual({
      type: 'split',
      direction: 'column',
      children: [leaf(1), leaf(3)],
      sizes: [0.5, 0.5],
    });
  });
});

describe('mosaic — removeAt + collapse', () => {
  it('collapses a 2-child split into the surviving child', () => {
    const before = split('row', [leaf(1), leaf(2)]);
    const after = removeAt(before, [0]);
    expect(after).toEqual(leaf(2));
  });

  it('keeps a 3-child split as a split with sizes redistributed', () => {
    const before = split('row', [leaf(1), leaf(2), leaf(3)], [0.5, 0.25, 0.25]);
    const after = removeAt(before, [1]) as { type: string; sizes: number[]; children: unknown[] };
    expect(after.type).toBe('split');
    expect(after.children).toHaveLength(2);
    // Removed share (0.25) gets distributed proportionally to remaining
    // siblings: leaf(1) was 0.5 → +0.5/0.75 × 0.25 = +0.167; leaf(3) was
    // 0.25 → +0.25/0.75 × 0.25 = +0.083. Sums to 1.0.
    expect(after.sizes[0] + after.sizes[1]).toBeCloseTo(1, 6);
    expect(after.sizes[0]).toBeGreaterThan(after.sizes[1]);
  });
});

describe('mosaic — resizeAt', () => {
  it('normalises new sizes to sum 1', () => {
    const before = split('row', [leaf(1), leaf(2)]);
    const after = resizeAt(before, [], [3, 1]) as { sizes: number[] };
    expect(after.sizes[0] + after.sizes[1]).toBeCloseTo(1, 6);
    expect(after.sizes[0]).toBeCloseTo(0.75, 6);
  });

  it('refuses to set sizes summing to zero', () => {
    const before = split('row', [leaf(1), leaf(2)]);
    const after = resizeAt(before, [], [0, 0]);
    expect(after).toBe(before);
  });
});

describe('mosaic — moveLeafTo (drag and drop)', () => {
  it("swaps two leaves on a 'center' drop", () => {
    const before = split('row', [leaf(1), leaf(2)]);
    const after = moveLeafTo(before, [0], [1], 'center');
    expect(leafMonitors(after)).toEqual([2, 1]);
  });

  it("does nothing when source and target paths are equal", () => {
    const before = split('row', [leaf(1), leaf(2)]);
    expect(moveLeafTo(before, [0], [0], 'center')).toBe(before);
  });

  it("leaves a vacant null leaf at the source on an edge drop", () => {
    const before = split('row', [leaf(1), leaf(2)]);
    const after = moveLeafTo(before, [0], [1], 'right');
    // Source vacated, target split with monitor 1 to its right.
    expect(leafMonitors(after)).toEqual([null, 2, 1]);
  });

  it("places source on the FIRST side of the split when zone is 'left' or 'top'", () => {
    const before = split('row', [leaf(1), leaf(2)]);
    const after = moveLeafTo(before, [0], [1], 'left');
    // Drop on the LEFT half of target: source comes before target.
    expect(leafMonitors(after)).toEqual([null, 1, 2]);
  });
});

describe('mosaic — setMonitorAt', () => {
  it('rebinds a leaf without touching siblings', () => {
    const before = split('column', [leaf(1), leaf(2)]);
    const after = setMonitorAt(before, [0], 9);
    expect(leafMonitors(after)).toEqual([9, 2]);
  });

  it('is a no-op when path points to a split', () => {
    const before = split('column', [leaf(1), leaf(2)]);
    const after = setMonitorAt(before, [], 9);
    expect(after).toBe(before);
  });
});

describe('mosaic — preset builders', () => {
  it('gridLayout fills row-major', () => {
    const t = gridLayout(2, 2, [10, 11, 12, 13]);
    expect(leafMonitors(t)).toEqual([10, 11, 12, 13]);
    expect(leafCount(t)).toBe(4);
  });

  it('gridLayout pads with nulls when monitorIds is short', () => {
    const t = gridLayout(2, 2, [10]);
    expect(leafMonitors(t)).toEqual([10, null, null, null]);
  });

  it('pipLayout: first monitor big, rest small on the right', () => {
    const t = pipLayout([1, 2, 3]) as { type: string; direction: string; sizes: number[] };
    expect(t.type).toBe('split');
    expect(t.direction).toBe('row');
    expect(t.sizes[0]).toBeGreaterThan(t.sizes[1]);
  });

  it('bannerLayout: top banner over a row of others', () => {
    const t = bannerLayout([1, 2, 3, 4]) as { type: string; direction: string };
    expect(t.type).toBe('split');
    expect(t.direction).toBe('column');
  });
});

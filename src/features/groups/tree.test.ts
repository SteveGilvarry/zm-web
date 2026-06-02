import { describe, expect, it } from 'vitest';
import {
  buildGroupTree,
  getDescendantGroups,
  getDescendantIds,
  getValidParentOptions,
} from './tree';
import type { Group } from '@/api/groups';

const g = (id: number, name: string, parent_id: number | null = null): Group =>
  ({ id, name, parent_id });

describe('buildGroupTree', () => {
  it('returns an empty array for an empty input', () => {
    expect(buildGroupTree([])).toEqual([]);
  });

  it('keeps top-level groups in original order at depth 0', () => {
    const out = buildGroupTree([g(1, 'A'), g(2, 'B'), g(3, 'C')]);
    expect(out.map((n) => [n.group.id, n.depth])).toEqual([
      [1, 0], [2, 0], [3, 0],
    ]);
  });

  it('places children immediately after their parent with depth+1', () => {
    const out = buildGroupTree([
      g(1, 'Outdoor'),
      g(2, 'Indoor'),
      g(3, 'Front Yard', 1),
      g(4, 'Back Yard', 1),
      g(5, 'East Lawn', 3),
    ]);
    expect(out.map((n) => [n.group.name, n.depth])).toEqual([
      ['Outdoor', 0],
      ['Front Yard', 1],
      ['East Lawn', 2],
      ['Back Yard', 1],
      ['Indoor', 0],
    ]);
  });

  it('treats parent_id === 0 the same as null (legacy schema quirk)', () => {
    const out = buildGroupTree([g(1, 'A', 0), g(2, 'B', null)]);
    expect(out.map((n) => n.depth)).toEqual([0, 0]);
  });

  it('treats groups with a missing parent as orphans pinned to root', () => {
    // Group 99 doesn't exist; group 5 points at it.
    const out = buildGroupTree([g(1, 'A'), g(5, 'Orphan', 99)]);
    expect(out.map((n) => [n.group.id, n.depth])).toEqual([
      [1, 0],
      [5, 0],
    ]);
  });

  it("does not loop on a parent_id cycle", () => {
    // 1 → 2, 2 → 1. Both rows will be skipped by the DFS cycle guard
    // because neither is a true root. They surface as "orphans" — i.e.
    // visible at depth 0 in input order — so the operator can fix them.
    const out = buildGroupTree([g(1, 'A', 2), g(2, 'B', 1)]);
    expect(out.length).toBeGreaterThan(0);
    // No node should appear twice.
    const ids = out.map((n) => n.group.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('getDescendantGroups / getDescendantIds', () => {
  const sample: Group[] = [
    g(1, 'Outdoor'),
    g(2, 'Indoor'),
    g(3, 'Front Yard', 1),
    g(4, 'Back Yard', 1),
    g(5, 'East Lawn', 3),
    g(6, 'West Lawn', 3),
  ];

  it('returns every transitive descendant of the root', () => {
    expect(getDescendantIds(sample, 1).sort()).toEqual([3, 4, 5, 6]);
  });

  it('returns an empty array for a leaf node', () => {
    expect(getDescendantGroups(sample, 5)).toEqual([]);
  });

  it('returns an empty array for an id that does not exist', () => {
    expect(getDescendantGroups(sample, 999)).toEqual([]);
  });
});

describe('getValidParentOptions', () => {
  const sample: Group[] = [
    g(1, 'Outdoor'),
    g(2, 'Indoor'),
    g(3, 'Front Yard', 1),
    g(4, 'East Lawn', 3),
  ];

  it('returns every group when creating (editingGroupId === null)', () => {
    const out = getValidParentOptions(sample, null);
    expect(out.map((n) => n.group.id)).toEqual([1, 3, 4, 2]);
  });

  it('excludes the editing group itself', () => {
    const out = getValidParentOptions(sample, 2);
    expect(out.map((n) => n.group.id)).not.toContain(2);
  });

  it('excludes descendants of the editing group (cycle prevention)', () => {
    const out = getValidParentOptions(sample, 1);
    const ids = out.map((n) => n.group.id);
    expect(ids).not.toContain(1); // self
    expect(ids).not.toContain(3); // child
    expect(ids).not.toContain(4); // grandchild
    expect(ids).toEqual([2]);     // only sibling left
  });
});

/**
 * Binary tree layout model for the Montage mosaic.
 *
 * A LayoutNode is either:
 *   - a leaf cell holding a monitor (or null if vacant)
 *   - a split with a direction (row | column), N children, and N sizes
 *     that sum to 1.0 (the ratios that determine each child's share)
 *
 * Paths address a node by the chain of child indices from the root:
 *   []        = root
 *   [0]       = first child of root
 *   [0, 1]    = second child of first child of root
 *
 * All mutating helpers return a new tree (immutable update). Splits with
 * exactly one remaining child collapse — i.e. the split itself is
 * replaced by that single child.
 */

export type LeafNode = {
  type: 'leaf';
  /** Monitor occupying the cell. null = vacant slot (acts as a drop
   *  target for drag-and-drop and reserves space). */
  monitorId: number | null;
};

export type SplitNode = {
  type: 'split';
  direction: 'row' | 'column';
  children: LayoutNode[];
  /** Ratios per child; same length as children, sums to 1.0. */
  sizes: number[];
};

export type LayoutNode = LeafNode | SplitNode;

export type Path = number[];

/* ------------------------------------------------------------------------ */
/*  Constructors                                                            */
/* ------------------------------------------------------------------------ */

export const leaf = (monitorId: number | null): LeafNode => ({
  type: 'leaf',
  monitorId,
});

export function split(
  direction: 'row' | 'column',
  children: LayoutNode[],
  sizes?: number[],
): SplitNode {
  const n = children.length;
  return {
    type: 'split',
    direction,
    children,
    sizes: sizes ?? new Array(n).fill(1 / n),
  };
}

/* ------------------------------------------------------------------------ */
/*  Read                                                                     */
/* ------------------------------------------------------------------------ */

export function nodeAt(tree: LayoutNode, path: Path): LayoutNode | null {
  let cur: LayoutNode = tree;
  for (const idx of path) {
    if (cur.type !== 'split') return null;
    cur = cur.children[idx];
    if (cur == null) return null;
  }
  return cur;
}

/** Collect every leaf's monitorId in tree order. */
export function leafMonitors(tree: LayoutNode): Array<number | null> {
  if (tree.type === 'leaf') return [tree.monitorId];
  return tree.children.flatMap(leafMonitors);
}

/** Count leaves in the tree. */
export function leafCount(tree: LayoutNode): number {
  if (tree.type === 'leaf') return 1;
  return tree.children.reduce((s, c) => s + leafCount(c), 0);
}

/* ------------------------------------------------------------------------ */
/*  Write                                                                    */
/* ------------------------------------------------------------------------ */

/**
 * Replace the node at `path` with a new node, returning a new tree.
 * If newNode is null, removes the node (parent split collapses if only
 * one child remains).
 */
export function setAt(
  tree: LayoutNode,
  path: Path,
  newNode: LayoutNode | null,
): LayoutNode {
  // Replace root
  if (path.length === 0) {
    return newNode ?? leaf(null);
  }

  function recurse(node: LayoutNode, depth: number): LayoutNode | null {
    if (depth === path.length) return newNode;
    if (node.type !== 'split') return node;

    const idx = path[depth];
    const child = node.children[idx];
    if (!child) return node;
    const updated = recurse(child, depth + 1);

    let newChildren: LayoutNode[];
    let newSizes: number[];
    if (updated == null) {
      // Remove the child
      newChildren = node.children.filter((_, i) => i !== idx);
      const removedSize = node.sizes[idx];
      const remaining = node.sizes.filter((_, i) => i !== idx);
      const remainingSum = remaining.reduce((s, v) => s + v, 0);
      // Redistribute the removed share proportionally to siblings.
      newSizes = remainingSum > 0
        ? remaining.map((v) => v + (v / remainingSum) * removedSize)
        : remaining;
    } else {
      newChildren = node.children.slice();
      newChildren[idx] = updated;
      newSizes = node.sizes;
    }

    // Collapse a split that ends up with a single child.
    if (newChildren.length === 1) return newChildren[0];
    // A split with zero children disappears entirely.
    if (newChildren.length === 0) return null as unknown as LayoutNode;

    return { type: 'split', direction: node.direction, children: newChildren, sizes: newSizes };
  }

  const result = recurse(tree, 0);
  // If recursion produced null at the root somehow, fall back to an
  // empty placeholder so the renderer never sees null.
  return result ?? leaf(null);
}

/**
 * Split a leaf at `path` along the given direction. The original leaf
 * becomes the first child of the new split; a new leaf for `newMonitorId`
 * becomes the second child. If a split with the same direction sits in
 * the same place, the new leaf is just appended to that split's
 * children (no nesting needed).
 */
export function splitAt(
  tree: LayoutNode,
  path: Path,
  direction: 'row' | 'column',
  newMonitorId: number | null,
): LayoutNode {
  const target = nodeAt(tree, path);
  if (!target) return tree;

  // If the target is already a split in the same direction, append.
  if (target.type === 'split' && target.direction === direction) {
    const n = target.children.length + 1;
    const newSizes = new Array(n).fill(1 / n);
    return setAt(tree, path, {
      type: 'split',
      direction,
      children: [...target.children, leaf(newMonitorId)],
      sizes: newSizes,
    });
  }

  // Otherwise wrap the target in a 2-child split.
  return setAt(tree, path, split(direction, [target, leaf(newMonitorId)]));
}

/** Update a split's sizes (ratios). path must point to a split node. */
export function resizeAt(
  tree: LayoutNode,
  path: Path,
  newSizes: number[],
): LayoutNode {
  const target = nodeAt(tree, path);
  if (!target || target.type !== 'split') return tree;
  if (newSizes.length !== target.children.length) return tree;
  // Normalise to sum 1.
  const sum = newSizes.reduce((s, v) => s + v, 0);
  if (sum <= 0) return tree;
  const normalised = newSizes.map((v) => v / sum);
  return setAt(tree, path, { ...target, sizes: normalised });
}

/** Change a leaf's monitorId. path must point to a leaf. */
export function setMonitorAt(
  tree: LayoutNode,
  path: Path,
  monitorId: number | null,
): LayoutNode {
  const target = nodeAt(tree, path);
  if (!target || target.type !== 'leaf') return tree;
  return setAt(tree, path, leaf(monitorId));
}

/** Remove the node at path. Parent split collapses if it ends up with
 *  one remaining child. */
export function removeAt(tree: LayoutNode, path: Path): LayoutNode {
  if (path.length === 0) return leaf(null);
  return setAt(tree, path, null);
}

/* ------------------------------------------------------------------------ */
/*  Preset layouts                                                          */
/* ------------------------------------------------------------------------ */

/** Build a grid of N columns and M rows, populating leaves from a list
 *  of monitor IDs in row-major order. Padded with null for empties. */
export function gridLayout(cols: number, rows: number, monitorIds: number[]): LayoutNode {
  const cells = new Array(cols * rows).fill(null).map(
    (_, i) => leaf(monitorIds[i] ?? null),
  );
  if (cells.length === 1) return cells[0];

  // Column-of-rows: each row contains cols leaves.
  const rowNodes: LayoutNode[] = [];
  for (let r = 0; r < rows; r++) {
    const rowCells = cells.slice(r * cols, (r + 1) * cols);
    rowNodes.push(rowCells.length === 1 ? rowCells[0] : split('row', rowCells));
  }
  return rowNodes.length === 1 ? rowNodes[0] : split('column', rowNodes);
}

/** Big primary tile on the left, small thumbnails stacked on the right. */
export function pipLayout(monitorIds: number[]): LayoutNode {
  if (monitorIds.length === 0) return leaf(null);
  if (monitorIds.length === 1) return leaf(monitorIds[0]);
  const [first, ...rest] = monitorIds;
  const sideCells = rest.map((id) => leaf(id));
  const side = sideCells.length === 1 ? sideCells[0] : split('column', sideCells);
  return split('row', [leaf(first), side], [0.65, 0.35]);
}

/** A wide banner on top, smaller tiles in a row beneath. */
export function bannerLayout(monitorIds: number[]): LayoutNode {
  if (monitorIds.length === 0) return leaf(null);
  if (monitorIds.length === 1) return leaf(monitorIds[0]);
  const [first, ...rest] = monitorIds;
  const bottom = rest.length === 1 ? leaf(rest[0]) : split('row', rest.map((id) => leaf(id)));
  return split('column', [leaf(first), bottom], [0.55, 0.45]);
}

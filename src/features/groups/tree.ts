import type { Group } from '@/api/groups';

/**
 * Tree helpers for the Groups page.
 *
 * The backend exposes a flat `Group[]` where each row carries a nullable
 * `parent_id`. Top-level groups have `parent_id === null` (or `0`, which
 * MySQL also uses when the column is unsigned + nullable in the legacy
 * schema). These helpers turn that flat list into a depth-aware order
 * suitable for indented rendering, and provide cycle-prevention queries
 * for the parent-selector dropdown.
 *
 * Everything here is pure — no React, no I/O — so it can be unit-tested
 * directly.
 */

/** A flattened tree node with its render depth (0 = root). */
export interface FlatGroupNode {
  group: Group;
  depth: number;
}

/** Treat null OR 0 as "no parent" — legacy ZoneMinder schemas often store 0. */
function topLevel(parentId: number | null | undefined): boolean {
  return parentId === null || parentId === undefined || parentId === 0;
}

/**
 * Turn a flat `Group[]` into a depth-first array with depth tags.
 *
 * - Top-level groups are returned in original order.
 * - Children appear immediately after their parent.
 * - Groups whose `parent_id` points at a non-existent row are treated as
 *   orphans and rendered at the root after the legitimate top-level
 *   groups (so we never silently drop data).
 * - Cycles are detected (a node already on the current DFS stack is
 *   skipped) so a corrupt parent chain can't loop forever.
 */
export function buildGroupTree(groups: Group[]): FlatGroupNode[] {
  const byId = new Map<number, Group>();
  for (const g of groups) byId.set(g.id, g);

  // Children indexed by parent id (preserving input order).
  const childrenOf = new Map<number, Group[]>();
  const roots: Group[] = [];
  const orphans: Group[] = [];

  for (const g of groups) {
    if (topLevel(g.parent_id)) {
      roots.push(g);
      continue;
    }
    const parentId = g.parent_id as number;
    if (!byId.has(parentId)) {
      orphans.push(g);
      continue;
    }
    const bucket = childrenOf.get(parentId) ?? [];
    bucket.push(g);
    childrenOf.set(parentId, bucket);
  }

  const out: FlatGroupNode[] = [];
  const onStack = new Set<number>();

  function visit(g: Group, depth: number) {
    if (onStack.has(g.id)) return; // cycle guard
    onStack.add(g.id);
    out.push({ group: g, depth });
    for (const child of childrenOf.get(g.id) ?? []) visit(child, depth + 1);
    onStack.delete(g.id);
  }

  for (const r of roots) visit(r, 0);
  // Orphans tack onto the root level so they remain visible / editable.
  for (const o of orphans) visit(o, 0);

  // Any node still unvisited belongs to a cycle (its parent chain never
  // hits a true root). Surface them at the root so corrupt data is still
  // editable rather than silently dropped. We re-check `placed` on every
  // iteration because each `visit()` may pull in siblings via childrenOf.
  if (out.length < groups.length) {
    const placed = new Set(out.map((n) => n.group.id));
    for (const g of groups) {
      if (placed.has(g.id)) continue;
      const before = out.length;
      visit(g, 0);
      for (let i = before; i < out.length; i++) placed.add(out[i].group.id);
    }
  }

  return out;
}

/**
 * Return every descendant group of `rootId` (excluding the root itself).
 *
 * Useful for two things:
 *   1. cycle prevention in the parent-select dropdown (a group cannot
 *      adopt itself or one of its descendants);
 *   2. the cascade-delete confirmation prompt.
 */
export function getDescendantGroups(groups: Group[], rootId: number): Group[] {
  const childrenOf = new Map<number, Group[]>();
  for (const g of groups) {
    if (topLevel(g.parent_id)) continue;
    const pid = g.parent_id as number;
    const bucket = childrenOf.get(pid) ?? [];
    bucket.push(g);
    childrenOf.set(pid, bucket);
  }

  const out: Group[] = [];
  const seen = new Set<number>([rootId]);
  const queue: number[] = [rootId];
  while (queue.length) {
    const next = queue.shift() as number;
    for (const child of childrenOf.get(next) ?? []) {
      if (seen.has(child.id)) continue; // cycle guard
      seen.add(child.id);
      out.push(child);
      queue.push(child.id);
    }
  }
  return out;
}

/** Convenience — just the ids. */
export function getDescendantIds(groups: Group[], rootId: number): number[] {
  return getDescendantGroups(groups, rootId).map((g) => g.id);
}

/**
 * Build the set of valid parent options for a given group.
 *
 * - When `editingGroupId` is null (creating a new group) every group is
 *   valid.
 * - When editing an existing group we must exclude the group itself AND
 *   any of its descendants, otherwise the user could create a cycle.
 *
 * The returned array preserves the depth-first tree ordering so the
 * dropdown reads naturally (parents above their children).
 */
export function getValidParentOptions(
  groups: Group[],
  editingGroupId: number | null,
): FlatGroupNode[] {
  const tree = buildGroupTree(groups);
  if (editingGroupId === null) return tree;
  const forbidden = new Set<number>([editingGroupId, ...getDescendantIds(groups, editingGroupId)]);
  return tree.filter((node) => !forbidden.has(node.group.id));
}

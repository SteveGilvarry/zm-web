/**
 * Wire format for `MontageLayout.positions`, shared with legacy ZoneMinder.
 *
 * Legacy (`montage.js`, May 2024+) stores
 *
 *   { "gridStack": [{ "id": "<monitorId>", "x", "y", "w", "h" }, …],
 *     "monitorStatusPosition": "insideImgBottom" | "outsideImgBottom" | "hidden" | "showOnHover",
 *     "monitorRatio": { "<monitorId>": "auto" | "16:9" | … } }
 *
 * on a 48-column gridstack (`layoutColumns`) with 4 px rows and
 * `sizeToContent`, so only the relative geometry survives a reload there.
 * Our wall is a recursive split tree (`LayoutNode`), which cannot always be
 * expressed as a grid and vice versa. So:
 *
 *  - Reading: prefer our own tree under `dashboard`, fall back to converting
 *    `gridStack` (rows by `y`, cells by `x`, sizes from `w`/`h`), and also
 *    accept the pre-2024 flat `[{monitor_id,x,y,w,h}]` list.
 *  - Writing: emit BOTH — a `gridStack` projection legacy can load, plus the
 *    exact tree under a `dashboard` key legacy ignores. Neither UI breaks
 *    the other's rows.
 */
import type { MontageStatusPosition } from '@/stores/montage';
import { leaf, split, type LayoutNode } from './mosaic';

/** `layoutColumns` in ZoneMinder's montage.js. */
export const GRIDSTACK_COLUMNS = 48;
/** Nominal vertical resolution for our projection; legacy re-derives heights. */
const GRIDSTACK_ROWS = 1000;

export interface GridStackItem {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type LegacyStatusPosition = 'insideImgBottom' | 'outsideImgBottom' | 'hidden' | 'showOnHover';

export interface MontagePositions {
  gridStack?: GridStackItem[];
  monitorStatusPosition?: LegacyStatusPosition | string;
  monitorRatio?: Record<string, string>;
  dashboard?: { version: 1; tree: LayoutNode };
}

export interface ParsedLayout {
  tree: LayoutNode;
  statusPosition?: MontageStatusPosition;
  /** Where the tree came from — `gridstack` rows were converted lossily. */
  source: 'dashboard' | 'gridstack';
}

const STATUS_TO_LEGACY: Record<MontageStatusPosition, LegacyStatusPosition> = {
  inside: 'insideImgBottom',
  outside: 'outsideImgBottom',
  hidden: 'hidden',
};

export function statusPositionFromLegacy(value: unknown): MontageStatusPosition | undefined {
  switch (value) {
    case 'insideImgBottom':
    case 'showOnHover':
      return 'inside';
    case 'outsideImgBottom':
      return 'outside';
    case 'hidden':
      return 'hidden';
    default:
      return undefined;
  }
}

function isLayoutNode(v: unknown): v is LayoutNode {
  if (!v || typeof v !== 'object') return false;
  const n = v as { type?: unknown; children?: unknown; monitorId?: unknown };
  if (n.type === 'leaf') return n.monitorId === null || typeof n.monitorId === 'number';
  if (n.type === 'split') return Array.isArray(n.children) && n.children.every(isLayoutNode);
  return false;
}

function toItems(raw: unknown): GridStackItem[] {
  if (!Array.isArray(raw)) return [];
  const out: GridStackItem[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const id = o.id ?? o.monitor_id;
    const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
    if (id == null || !Number.isFinite(Number(id))) continue;
    out.push({
      id: String(id),
      x: num(o.x, 0),
      y: num(o.y, 0),
      w: Math.max(1, num(o.w, 1)),
      h: Math.max(1, num(o.h, 1)),
    });
  }
  return out;
}

/**
 * Gridstack items → split tree. Items that share a `y` form a row; rows stack
 * top to bottom. Column shares come from `w`, row shares from the tallest
 * item in the row. Good for every layout the legacy UI can save (it packs
 * upward with `float: false`); exotic overlaps degrade to "a row per y".
 */
export function gridStackToTree(items: GridStackItem[]): LayoutNode | null {
  if (items.length === 0) return null;
  const rowsByY = new Map<number, GridStackItem[]>();
  for (const item of items) {
    const row = rowsByY.get(item.y);
    if (row) row.push(item);
    else rowsByY.set(item.y, [item]);
  }
  const rows = [...rowsByY.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => row);
  const rowNodes = rows.map((row) => {
    const cells = row.slice().sort((a, b) => a.x - b.x);
    if (cells.length === 1) return leaf(Number(cells[0].id));
    const total = cells.reduce((s, c) => s + c.w, 0);
    return split('row', cells.map((c) => leaf(Number(c.id))), cells.map((c) => c.w / total));
  });
  if (rowNodes.length === 1) return rowNodes[0];
  const heights = rows.map((row) => Math.max(...row.map((c) => c.h)));
  const totalH = heights.reduce((s, h) => s + h, 0);
  return split('column', rowNodes, heights.map((h) => h / totalH));
}

/** Split tree → gridstack items on the 48-column canvas. Vacant leaves are skipped. */
export function treeToGridStack(tree: LayoutNode): GridStackItem[] {
  const out: GridStackItem[] = [];
  const walk = (node: LayoutNode, x0: number, y0: number, w: number, h: number) => {
    if (node.type === 'leaf') {
      if (node.monitorId == null) return;
      const x = Math.round(x0 * GRIDSTACK_COLUMNS);
      const y = Math.round(y0 * GRIDSTACK_ROWS);
      out.push({
        id: String(node.monitorId),
        x,
        y,
        w: Math.max(1, Math.round((x0 + w) * GRIDSTACK_COLUMNS) - x),
        h: Math.max(1, Math.round((y0 + h) * GRIDSTACK_ROWS) - y),
      });
      return;
    }
    let offset = 0;
    node.children.forEach((child, i) => {
      const share = node.sizes[i] ?? 1 / node.children.length;
      if (node.direction === 'row') walk(child, x0 + offset * w, y0, share * w, h);
      else walk(child, x0, y0 + offset * h, w, share * h);
      offset += share;
    });
  };
  walk(tree, 0, 0, 1, 1);
  return out;
}

/** Parse a `positions` column. Null for preset rows (`positions: null`) and junk. */
export function parsePositions(positions: string | null | undefined): ParsedLayout | null {
  if (!positions) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(positions);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;

  // Pre-2024 legacy: a bare list of {monitor_id,x,y,w,h}.
  if (Array.isArray(raw)) {
    const tree = gridStackToTree(toItems(raw));
    return tree ? { tree, source: 'gridstack' } : null;
  }

  const obj = raw as MontagePositions & { version?: unknown; tree?: unknown };
  const statusPosition = statusPositionFromLegacy(obj.monitorStatusPosition);

  if (obj.dashboard?.version === 1 && isLayoutNode(obj.dashboard.tree)) {
    return { tree: obj.dashboard.tree, statusPosition, source: 'dashboard' };
  }
  // Rows written by this dashboard before it learned to speak gridstack.
  if (obj.version === 1 && isLayoutNode(obj.tree)) {
    return { tree: obj.tree, statusPosition, source: 'dashboard' };
  }
  if (Array.isArray(obj.gridStack)) {
    const tree = gridStackToTree(toItems(obj.gridStack));
    return tree ? { tree, statusPosition, source: 'gridstack' } : null;
  }
  return null;
}

/** Serialise for `positions`: legacy-loadable gridStack + our exact tree. */
export function serialisePositions(tree: LayoutNode, statusPosition: MontageStatusPosition): string {
  const gridStack = treeToGridStack(tree);
  const monitorRatio: Record<string, string> = {};
  for (const item of gridStack) monitorRatio[item.id] = 'auto';
  const payload: MontagePositions = {
    gridStack,
    monitorStatusPosition: STATUS_TO_LEGACY[statusPosition],
    monitorRatio,
    dashboard: { version: 1, tree },
  };
  return JSON.stringify(payload);
}

/**
 * Tile geometry for the classic montage wall, in ZoneMinder's own units.
 *
 * Legacy `montage.js` runs the wall through gridstack: 48 columns
 * (`layoutColumns`), `cellHeight: '4px'`, `sizeToContent: true`,
 * `float: false`, and `save(false, false)` writes `{id, x, y, w, h}` per
 * tile into `Positions.gridStack`. `x`/`w` are columns; `y`/`h` are 4 px
 * rows that gridstack derives from the rendered tile, so only their
 * relative sizes mean anything on another screen.
 *
 * We reproduce that on a CSS grid: `x`/`w` place the tile
 * (`grid-column: x+1 / span w`), the tile's own aspect ratio plays the part
 * of `sizeToContent`, and `y`/`h` are measured back off the DOM when the
 * layout is saved so what we write is what legacy would have written.
 */
import { GRIDSTACK_COLUMNS, type GridStackItem } from './layoutFormat';

/** gridstack's `cellHeight: '4px'` — the unit `y` and `h` are counted in. */
export const GRIDSTACK_CELL_HEIGHT = 4;

/**
 * Tile height to assume before anything has been measured (400 px worth of
 * 4 px rows, about a 16:9 tile on a half-width wall). Only ratios matter.
 */
const NOMINAL_HEIGHT = 100;

const clampWidth = (w: number) => Math.max(1, Math.min(GRIDSTACK_COLUMNS, Math.round(w)));

/** By row, then by column — the order legacy's `float: false` grid renders in. */
export function sortItems(items: GridStackItem[]): GridStackItem[] {
  return items.slice().sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * `N Wide` on the 48-column canvas. Column edges are rounded so the row
 * always fills all 48 columns, even for the counts that do not divide it
 * (5, 20, 32 — presets this dashboard adds).
 */
export function presetItems(monitorIds: number[], columns: number): GridStackItem[] {
  const cols = Math.max(1, Math.min(GRIDSTACK_COLUMNS, Math.round(columns)));
  return monitorIds.map((id, i) => {
    const c = i % cols;
    const x = Math.round((c * GRIDSTACK_COLUMNS) / cols);
    const w = Math.round(((c + 1) * GRIDSTACK_COLUMNS) / cols) - x;
    return { id: String(id), x, y: Math.floor(i / cols) * NOMINAL_HEIGHT, w: Math.max(1, w), h: NOMINAL_HEIGHT };
  });
}

/**
 * Flow the tiles left to right in array order, wrapping at 48 columns —
 * what gridstack does with `float: false` once a tile has been dropped or
 * resized. Gaps a hand-placed legacy layout may have are closed; that only
 * happens after the operator moves something, never on load.
 */
export function packItems(items: GridStackItem[]): GridStackItem[] {
  const out: GridStackItem[] = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  for (const item of items) {
    const w = clampWidth(item.w);
    if (x > 0 && x + w > GRIDSTACK_COLUMNS) {
      y += rowHeight || NOMINAL_HEIGHT;
      x = 0;
      rowHeight = 0;
    }
    out.push({ ...item, x, y, w });
    x += w;
    rowHeight = Math.max(rowHeight, Math.max(1, item.h));
  }
  return out;
}

/**
 * Fit a saved layout to what is on screen: tiles for monitors that are gone
 * drop out (legacy just leaves them out too), and cameras the layout never
 * named are packed onto fresh rows underneath at the current column count.
 * Geometry the layout did save is left exactly as it was.
 */
export function alignItems(items: GridStackItem[], monitorIds: number[], columns: number): GridStackItem[] {
  const wanted = new Set(monitorIds.map(String));
  const kept = sortItems(items.filter((i) => wanted.has(i.id)));
  const have = new Set(kept.map((i) => i.id));
  const extra = monitorIds.filter((id) => !have.has(String(id)));
  if (extra.length === 0) return kept;
  const bottom = kept.reduce((max, i) => Math.max(max, i.y + i.h), 0);
  return [...kept, ...presetItems(extra, columns).map((i) => ({ ...i, y: i.y + bottom }))];
}

/** Set one tile's width in columns, then close the gap it left. */
export function resizeItem(items: GridStackItem[], monitorId: number, w: number): GridStackItem[] {
  const id = String(monitorId);
  if (!items.some((i) => i.id === id)) return items;
  return packItems(items.map((i) => (i.id === id ? { ...i, w: clampWidth(w) } : i)));
}

/** Move `fromId` to `toId`'s place (an Edit Layout drop), then repack. */
export function reorderItems(items: GridStackItem[], fromId: number, toId: number): GridStackItem[] {
  if (fromId === toId) return items;
  const from = items.findIndex((i) => i.id === String(fromId));
  const to = items.findIndex((i) => i.id === String(toId));
  if (from < 0 || to < 0) return items;
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return packItems(next);
}

/**
 * Read `y` and `h` back off the rendered wall in 4 px rows, so a layout
 * saved here stacks in the PHP UI the way it stacks here. Where there is
 * nothing to measure (jsdom, a wall that has not laid out yet) the nominal
 * heights stand.
 */
export function measureItems(container: HTMLElement | null, items: GridStackItem[]): GridStackItem[] {
  if (!container) return items;
  const base = container.getBoundingClientRect();
  if (!base.height) return items;
  return items.map((item) => {
    const el = container.querySelector<HTMLElement>(`[data-gs-id="${item.id}"]`);
    if (!el) return item;
    const rect = el.getBoundingClientRect();
    if (!rect.height) return item;
    return {
      ...item,
      y: Math.max(0, Math.round((rect.top - base.top) / GRIDSTACK_CELL_HEIGHT)),
      h: Math.max(1, Math.round(rect.height / GRIDSTACK_CELL_HEIGHT)),
    };
  });
}

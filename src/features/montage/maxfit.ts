/**
 * Legacy `maxfit2` (`web/skins/classic/js/montage_common.js`): pack the wall's
 * tiles into the viewport at the largest scale they all fit at.
 *
 * ZoneMinder binary-searches the scale between 0.05 and 5 and, for each
 * candidate, lays the tiles out greedily: the first at the origin, every
 * later one at the top-right or bottom-left corner of a tile already placed,
 * choosing the smallest Y and then the smallest X. A scale where every tile
 * lands is a hit (search upwards from it) and the arrangement covering the
 * most area wins; a scale where one does not is a miss (search downwards).
 * Kept pure so the packing can be tested without a DOM.
 */

/** One tile's natural size, before the fitted scale is applied. */
export interface FitBox {
  width: number;
  height: number;
}

/** Where one tile ends up, in pixels relative to the viewport's top-left. */
export interface FitPlacement {
  left: number;
  top: number;
  width: number;
  height: number;
}

const MIN_SCALE = 0.05;
const MAX_SCALE = 5;
/** Legacy's convergence threshold for the binary search. */
const SCALE_EPSILON = 0.01;

interface Rect { x1: number; y1: number; x2: number; y2: number }

/** Legacy `doesItFit`: inside the viewport and clear of everything placed. */
function fits(placed: Rect[], x: number, y: number, w: number, h: number, divW: number, divH: number): boolean {
  if (x + w >= divW || y + h >= divH) return false;
  return placed.every((p) => p.x1 > x + w - 1 || p.x2 < x || p.y1 > y + h - 1 || p.y2 < y);
}

/** One pass of the greedy placement at `scale`; null when a tile will not fit. */
function place(
  boxes: FitBox[],
  scale: number,
  divW: number,
  divH: number,
  borderW: number,
  borderH: number,
): Rect[] | null {
  const placed: Rect[] = [];
  for (const box of boxes) {
    const w = box.width * scale + borderW;
    const h = box.height * scale + borderH;
    let fitX = Infinity;
    let fitY = Infinity;

    for (const p of placed) {
      // Top right of an already-placed tile, then its bottom left.
      if (fits(placed, p.x2 + 1, p.y1, w, h, divW, divH)
        && (p.y1 < fitY || (p.y1 === fitY && p.x2 + 1 < fitX))) {
        fitX = p.x2 + 1;
        fitY = p.y1;
      }
      if (fits(placed, p.x1, p.y2 + 1, w, h, divW, divH)
        && (p.y2 + 1 < fitY || (p.y2 + 1 === fitY && p.x1 < fitX))) {
        fitX = p.x1;
        fitY = p.y2 + 1;
      }
    }
    if (placed.length === 0 && fits(placed, 0, 0, w, h, divW, divH)) {
      fitX = 0;
      fitY = 0;
    }
    if (fitX === Infinity) return null;
    placed.push({ x1: fitX, y1: fitY, x2: fitX + w, y2: fitY + h });
  }
  return placed;
}

/**
 * Pack `boxes` into a `divW` × `divH` viewport, centred horizontally.
 * Returns one placement per box in the same order, or null when nothing
 * fits — legacy leaves the wall alone in that case, and so should the caller.
 */
export function maxFit(
  boxes: FitBox[],
  divW: number,
  divH: number,
  borders: { width: number; height: number } = { width: 0, height: 0 },
): FitPlacement[] | null {
  if (boxes.length === 0 || divW <= 0 || divH <= 0) return null;

  let minScale = MIN_SCALE;
  let maxScale = MAX_SCALE;
  let best: Rect[] | null = null;
  let bestArea = 0;

  while (maxScale - minScale >= SCALE_EPSILON) {
    const scale = (maxScale + minScale) / 2;
    const attempt = place(boxes, scale, divW, divH, borders.width, borders.height);
    if (!attempt) {
      maxScale = scale;
      continue;
    }
    minScale = scale;
    const area = attempt.reduce((sum, r) => sum + (r.x2 - r.x1) * (r.y2 - r.y1), 0);
    if (area > bestArea) {
      bestArea = area;
      best = attempt;
    }
  }
  if (!best) return null;

  const maxRight = best.reduce((max, r) => Math.max(max, r.x2), 0);
  const offsetX = Math.max(0, Math.floor((divW - maxRight) / 2));
  return best.map((r) => ({
    left: r.x1 + offsetX,
    top: r.y1,
    width: r.x2 - r.x1 + 1 - borders.width,
    height: r.y2 - r.y1 + 1 - borders.height,
  }));
}

/**
 * Justified-row layout for aspect-constrained tiles.
 *
 * Given a list of tiles each with a fixed aspect ratio (width / height)
 * and a viewport width, partition them into rows such that every row's
 * tiles share a single row height H, chosen so the sum of tile widths
 * exactly equals the viewport width minus inter-tile gaps. The standard
 * algorithm used by Flickr, Google Photos, and most justified photo
 * grids — well-suited to small (4–16 tiles) heterogeneous-aspect sets.
 *
 * The packer aims for `targetHeight` row heights and breaks a row as
 * soon as keeping all the current tiles at that target would overflow
 * the viewport. When breaking, it picks the boundary that puts the
 * actual row height closer to the target — either keep the tile in
 * the current row (slightly shorter row) or push it to the next row
 * (slightly taller row).
 *
 * The final partial row is rendered at *up to* targetHeight so a single
 * leftover landscape doesn't balloon to viewport-wide / 16:9 (huge).
 *
 * `aspect` here is the WIDTH:HEIGHT ratio of the displayable area
 * (video frame post-rotation). If the tile has a fixed-height footer
 * (e.g. a status ribbon), that's outside this layout's concern — the
 * caller renders the row at the algorithm's height plus its own
 * decorations.
 */

export interface JustifyInputTile<T> {
  data: T;
  /** Width / height of the displayable area. */
  aspect: number;
}

export interface JustifiedTile<T> extends JustifyInputTile<T> {
  width: number;
  height: number;
}

export interface JustifiedRow<T> {
  height: number;
  tiles: JustifiedTile<T>[];
}

export interface JustifyOptions {
  /** Preferred row height in px; the algorithm picks rows close to this. */
  targetHeight?: number;
  /** Max row height in px (caps single-tile rows that would otherwise be huge). */
  maxHeight?: number;
  /** Inter-tile gap in px (horizontal between tiles in a row). */
  gap?: number;
}

const DEFAULTS: Required<JustifyOptions> = {
  targetHeight: 360,
  maxHeight: 600,
  gap: 16,
};

/**
 * Coarse aspect classifier so we can keep portraits/landscapes/squares
 * in separate rows. Mixing them in a single row makes the wider tile
 * dominate visually and squeezes the narrower ones — even though the
 * raw packing math says it fits.
 */
function aspectClass(aspect: number): 'portrait' | 'square' | 'landscape' {
  if (aspect < 0.95) return 'portrait';
  if (aspect > 1.05) return 'landscape';
  return 'square';
}

export function justifyRows<T>(
  tiles: JustifyInputTile<T>[],
  viewportWidth: number,
  options: JustifyOptions = {},
): JustifiedRow<T>[] {
  const opts = { ...DEFAULTS, ...options };
  if (tiles.length === 0 || viewportWidth <= 0) return [];

  const rows: JustifiedRow<T>[] = [];
  let pending: JustifyInputTile<T>[] = [];

  for (const tile of tiles) {
    // Aspect-class boundary: close the current row before adding a
    // tile whose class differs from what's already in pending. Keeps
    // portrait/landscape/square groups visually consistent instead of
    // mixing them into one row where the widest aspect dominates.
    if (pending.length > 0 && aspectClass(tile.aspect) !== aspectClass(pending[0].aspect)) {
      const sumAspect = pending.reduce((s, t) => s + t.aspect, 0);
      const gapsTotal = opts.gap * (pending.length - 1);
      const availWidth = Math.max(0, viewportWidth - gapsTotal);
      // Use min(target, naturalH) so a row of 1–2 wide tiles doesn't
      // get scaled up beyond the target just because there's room.
      const naturalH = sumAspect > 0 ? availWidth / sumAspect : opts.targetHeight;
      rows.push(buildRow(pending, Math.min(opts.targetHeight, naturalH, opts.maxHeight)));
      pending = [];
    }

    pending.push(tile);

    // Width available for tiles in this row (viewport minus gaps).
    const gapsTotal = opts.gap * (pending.length - 1);
    const availWidth = Math.max(0, viewportWidth - gapsTotal);
    const sumAspect = pending.reduce((s, t) => s + t.aspect, 0);
    if (sumAspect <= 0) continue;

    // Height at which this row's tiles would EXACTLY fill the available
    // width. If it's still ≥ target, we can keep adding tiles (subsequent
    // tiles will push the height down toward target). If it's below
    // target, this row is full — close it.
    const exactH = availWidth / sumAspect;

    if (exactH >= opts.targetHeight) {
      // Row not full yet; keep accumulating.
      continue;
    }

    // Row would have to drop below target. Decide whether the current
    // tile stays in this row (slightly shorter row) or goes to next row
    // (slightly taller, possibly capped at max).
    const gapsWithout = opts.gap * Math.max(0, pending.length - 2);
    const availWithout = Math.max(0, viewportWidth - gapsWithout);
    const sumWithout = sumAspect - tile.aspect;
    const heightWithout = sumWithout > 0
      ? availWithout / sumWithout
      : Infinity;

    const distWith = Math.abs(exactH - opts.targetHeight);
    const distWithout = Math.abs(heightWithout - opts.targetHeight);

    if (sumWithout > 0 && distWithout < distWith) {
      // Better fit without the current tile: close row, start a fresh
      // row with just this tile.
      pending.pop();
      rows.push(buildRow(pending, heightWithout));
      pending = [tile];
    } else {
      // Keep the tile in this row.
      rows.push(buildRow(pending, exactH));
      pending = [];
    }
  }

  // Last partial row — don't let a leftover single landscape balloon to
  // a huge banner. Render at min(targetHeight, naturalHeight, maxHeight).
  if (pending.length > 0) {
    const sumAspect = pending.reduce((s, t) => s + t.aspect, 0);
    const gapsTotal = opts.gap * (pending.length - 1);
    const availWidth = Math.max(0, viewportWidth - gapsTotal);
    const exactH = sumAspect > 0 ? availWidth / sumAspect : opts.targetHeight;
    const h = Math.min(opts.targetHeight, exactH, opts.maxHeight);
    rows.push(buildRow(pending, h));
  }

  // Cap each row's height at maxHeight (covers edge cases like a single-
  // tile row that would otherwise be too tall).
  return rows.map((row) => {
    if (row.height <= opts.maxHeight) return row;
    return buildRow(
      row.tiles.map(({ data, aspect }) => ({ data, aspect })),
      opts.maxHeight,
    );
  });
}

function buildRow<T>(
  tiles: JustifyInputTile<T>[],
  height: number,
): JustifiedRow<T> {
  return {
    height,
    tiles: tiles.map((t) => ({
      ...t,
      height,
      width: height * t.aspect,
    })),
  };
}

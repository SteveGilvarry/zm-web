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

/* -------------------------------------------------------------------------- */
/*  Wall packing                                                              */
/* -------------------------------------------------------------------------- */

export interface WallOptions {
  /** Inter-tile gap, horizontal and vertical. */
  gap?: number;
  /** Fixed chrome under each tile (the name + activity ribbon). */
  ribbon?: number;
  /** Most rows to consider; a wall past this is a list, not a wall. */
  maxRows?: number;
}

/**
 * Pack tiles into a wall that fills a fixed area.
 *
 * `justifyRows` answers "what shape are the rows at roughly this height",
 * which is the right question for a scrolling gallery and the wrong one for
 * a console: an operator's cameras should fill the screen and stop, not
 * trail off below the fold. So the row count is the variable here. For each
 * candidate the tiles are split into contiguous groups of roughly equal
 * total aspect, each row is set to the height that exactly fills the width,
 * and the whole thing is scaled down if it is still too tall. The winner is
 * whichever row count leaves the smallest tile largest — which is what
 * "the cameras are as big as they can be" means.
 */
export function packWall<T>(
  tiles: JustifyInputTile<T>[],
  width: number,
  availableHeight: number,
  options: WallOptions = {},
): JustifiedRow<T>[] {
  const gap = options.gap ?? 16;
  const ribbon = options.ribbon ?? 0;
  const maxRows = options.maxRows ?? 12;
  if (tiles.length === 0 || width <= 0) return [];

  let best: { rows: JustifiedRow<T>[]; score: number } | null = null;

  for (let R = 1; R <= Math.min(tiles.length, maxRows); R++) {
    const groups = balancedGroups(tiles, R);
    const heights = groups.map((g) => {
      const sumAspect = g.reduce((s, t) => s + t.aspect, 0);
      const avail = Math.max(0, width - gap * (g.length - 1));
      return sumAspect > 0 ? avail / sumAspect : 0;
    });
    const overhead = R * ribbon + gap * (R - 1);
    const sumHeights = heights.reduce((s, h) => s + h, 0);
    if (sumHeights <= 0) continue;
    // The ribbons alone already fill the screen at this row count: there is
    // no video left to show, so this candidate is out. (Skipping the check
    // when the height is unknown keeps server-side/first-paint sane.)
    if (availableHeight > 0 && overhead >= availableHeight) continue;
    // Too tall to fit: shrink every row by the same factor, which keeps the
    // rows' relative proportions and simply centres them within the width.
    const scale = availableHeight > 0
      ? Math.min(1, (availableHeight - overhead) / sumHeights)
      : 1;
    const scaled = heights.map((h) => h * scale);
    const score = Math.min(...scaled);
    if (!best || score > best.score) {
      best = {
        score,
        rows: groups.map((g, i) => buildRow(g, scaled[i])),
      };
    }
  }

  // Nothing fits — not even one row of ribbons. Show the single row anyway;
  // a clipped wall beats a blank page.
  if (!best) return [buildRow(tiles, Math.max(1, availableHeight - ribbon))];
  return best.rows;
}

/**
 * Split tiles into `count` contiguous groups of roughly equal total aspect,
 * so no row ends up with visibly smaller tiles than its neighbours.
 *
 * Two rules, in order: never strand a group with no tiles, and otherwise
 * close the current group when adding the next tile would carry it further
 * past its share than stopping short of it.
 */
function balancedGroups<T>(
  tiles: JustifyInputTile<T>[],
  count: number,
): JustifyInputTile<T>[][] {
  if (count <= 1) return [tiles];
  if (count >= tiles.length) return tiles.map((t) => [t]);

  const total = tiles.reduce((s, t) => s + t.aspect, 0);
  const target = total / count;
  const groups: JustifyInputTile<T>[][] = [];
  let current: JustifyInputTile<T>[] = [];
  let running = 0;

  tiles.forEach((tile, i) => {
    const tilesLeft = tiles.length - i;        // including this one
    const groupsLeft = count - groups.length;  // including the open one
    const isLastGroup = groups.length === count - 1;

    if (current.length > 0 && !isLastGroup) {
      // Keeping this tile would leave a later group with nothing.
      const mustClose = tilesLeft < groupsLeft;
      // Or it simply belongs to the next row: stopping here is closer to an
      // even split than carrying on.
      const closerToStop =
        Math.abs(target - running) < Math.abs(running + tile.aspect - target) &&
        tilesLeft >= groupsLeft - 1;
      if (mustClose || closerToStop) {
        groups.push(current);
        current = [];
        running = 0;
      }
    }

    current.push(tile);
    running += tile.aspect;
  });

  if (current.length > 0) groups.push(current);
  return groups;
}

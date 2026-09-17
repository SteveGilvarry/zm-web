import type { Point } from '@/api/zones';

type Segment = readonly [Point, Point];

/**
 * Do two closed segments touch or cross? A port of ZoneMinder's
 * `linesIntersect()` (`web/includes/functions.php:1294`): reject on
 * disjoint bounding boxes first, then compare the two lines, treating
 * touching endpoints and overlapping collinear runs as intersections —
 * which is what legacy does, and what makes a "polygon" with a doubled
 * vertex invalid there too.
 */
export function segmentsIntersect(a: Segment, b: Segment): boolean {
  const [p1, p2] = a;
  const [p3, p4] = b;

  if (
    Math.max(p1.x, p2.x) < Math.min(p3.x, p4.x)
    || Math.max(p3.x, p4.x) < Math.min(p1.x, p2.x)
    || Math.max(p1.y, p2.y) < Math.min(p3.y, p4.y)
    || Math.max(p3.y, p4.y) < Math.min(p1.y, p2.y)
  ) return false;

  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;

  const denom = d1x * d2y - d1y * d2x;
  if (denom === 0) {
    // Parallel. The bounding boxes already overlap, so they intersect only
    // if they are also collinear.
    const cross = (p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x;
    return cross === 0;
  }

  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
  const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

/**
 * True when the polygon's own edges cross — legacy `isSelfIntersecting()`
 * (`functions.php:1383`), which `zone.js:18` turns into the
 * "Polygon edges must not intersect" error that blocks Save.
 *
 * Edges are built the same way, closing edge included, and a pair is only
 * compared when it is not adjacent: `j` runs from `i + 2` to
 * `n + min(0, i - 1)`, which for `i = 0` stops before the closing edge that
 * shares a vertex with edge 0.
 */
export function isSelfIntersecting(points: readonly Point[]): boolean {
  const n = points.length;
  if (n < 4) return false;

  const edges: Segment[] = [];
  for (let j = 0, i = n - 1; j < n; i = j++) edges.push([points[i], points[j]]);

  for (let i = 0; i <= n - 2; i++) {
    for (let j = i + 2; j < n + Math.min(0, i - 1); j++) {
      if (segmentsIntersect(edges[i], edges[j])) return true;
    }
  }
  return false;
}

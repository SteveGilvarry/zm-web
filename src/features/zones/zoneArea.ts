import { parseCoords, type Point, type Zone } from '@/api/zones';

/**
 * Does a stored `Coords` string hold percentages of the frame rather than
 * pixels?
 *
 * ZoneMinder 1.39.41 writes zones as percentages from its own editor
 * (`zone.php:97-100`, two decimals per value) while older zones, and every
 * zone this UI saves, are integer pixels. `Units` does not say which: the
 * capture daemon ignores it and decides from the string itself — a decimal
 * point means percent (`zm_zone.cpp:1033-1041`). Legacy's PHP instead treats
 * any value over 100 as pixels (`convertPixelPointsToPercent`). Both agree on
 * every sane zone; for decimal pixel coords like `56.17,177.64` the daemon
 * would read 177% and clamp, so the legacy reading wins there.
 */
export function coordsArePercent(coords: string): boolean {
  if (!coords || !coords.includes('.')) return false;
  return parseCoords(coords).every((p) => p.x <= 100 && p.y <= 100);
}

/**
 * The polygon in frame pixels, whichever form it is stored in. Percent
 * coords are scaled to the view frame; pixel coords pass through untouched
 * (never rescaled — that is the F-3 corruption).
 */
export function coordsToPixels(coords: string, frame: { width: number; height: number }): Point[] {
  const points = parseCoords(coords);
  if (!coordsArePercent(coords)) return points;
  return points.map((p) => ({ x: (p.x / 100) * frame.width, y: (p.y / 100) * frame.height }));
}

/** Shoelace area of a polygon given as x,y pairs (absolute value). */
export function polygonArea(points: Array<{ x: number; y: number }>): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/**
 * Area of a zone's polygon, in pixels and as a share of the view frame.
 *
 * This is what the list and the detail panel show, and what the editor shows
 * while the operator drags. It is deliberately *not* `ZoneResponse.area`:
 * that column is written by ZoneMinder's own zone editor and the API changes
 * `Coords` without recomputing it (zm-api#43), so on a zone last saved by
 * anything else the stored figure is stale — every zone on the dev box
 * reports a four-digit `area` for a full-frame polygon. Where the two
 * disagree, `zoneAreaMismatch()` says so rather than quietly picking one.
 *
 * `Units` never decides how `Coords` is read — see `coordsArePercent()`.
 * Treating integer coords as percentages because `Units` says Percent is
 * exactly the bug that corrupted zones before (plan F-3).
 */
export function zoneArea(
  zone: Pick<Zone, 'coords' | 'units'>,
  frame: { width: number; height: number },
): { px: number; pct: number } {
  const frameArea = frame.width * frame.height;
  const px = Math.round(polygonArea(coordsToPixels(zone.coords, frame)));
  return { px, pct: frameArea > 0 ? (px / frameArea) * 100 : 0 };
}

/**
 * ZoneMinder's stored `Zones.Area` and its share of the view frame — what
 * legacy prints. Kept so the detail panel can show the stored value beside
 * the measured one; see `zoneAreaMismatch()` for why they can differ.
 */
export function zoneReportedArea(
  zone: Pick<Zone, 'area'>,
  frame: { width: number; height: number },
): { px: number; pct: number } {
  const frameArea = frame.width * frame.height;
  const px = zone.area ?? 0;
  return { px, pct: frameArea > 0 ? (px / frameArea) * 100 : 0 };
}

/**
 * True when the stored `Area` disagrees with the polygon by more than a
 * rounding wobble. ZoneMinder converts the percentage forms of the pixel
 * thresholds using `Area`, so a stale value is not just a wrong readout —
 * it skews what the operator sees and, if they save, what gets stored
 * (zm-api#43). Worth surfacing rather than hiding.
 */
export function zoneAreaMismatch(
  zone: Pick<Zone, 'coords' | 'units' | 'area'>,
  frame: { width: number; height: number },
): boolean {
  if (zone.area == null) return false;
  const measured = zoneArea(zone, frame).px;
  if (measured === 0) return false;
  return Math.abs(measured - zone.area) / measured > 0.01;
}

/** Polygon points in frame pixels (for the SVG overlay). */
export function zonePixelPoints(
  zone: Pick<Zone, 'coords' | 'units'>,
  frame: { width: number; height: number },
): Array<{ x: number; y: number }> {
  return coordsToPixels(zone.coords, frame);
}

/** True when any vertex falls outside the frame — legacy shows a warning icon. */
export function zoneOutOfBounds(
  zone: Pick<Zone, 'coords' | 'units'>,
  frame: { width: number; height: number },
): boolean {
  return zonePixelPoints(zone, frame).some(
    (p) => p.x < 0 || p.y < 0 || p.x > frame.width || p.y > frame.height,
  );
}

/** Legacy zone colours by type (`zone.php` / `zones.js`). */
export function zoneColour(type: string): string {
  switch (type) {
    case 'Active': return '#ff0000';
    case 'Inclusive': return '#ffa500';
    case 'Exclusive': return '#800080';
    case 'Preclusive': return '#0000ff';
    case 'Privacy': return '#000000';
    case 'Inactive':
    default: return '#ffffff';
  }
}

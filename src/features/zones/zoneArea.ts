import { parseCoords, type Zone } from '@/api/zones';

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
 * ZoneMinder stores `Coords` in pixels of the view frame whatever `Units`
 * says — `Units` only scales the threshold fields (MinAlarmPixels etc.).
 * Treating Percent-unit coords as percentages is exactly the bug that
 * corrupted zones before (plan F-3), so don't.
 */
export function zoneArea(
  zone: Pick<Zone, 'coords' | 'units'>,
  frame: { width: number; height: number },
): { px: number; pct: number } {
  const frameArea = frame.width * frame.height;
  const px = Math.round(polygonArea(parseCoords(zone.coords)));
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

/** Polygon points in frame pixels (for the SVG overlay) — coords already are. */
export function zonePixelPoints(
  zone: Pick<Zone, 'coords' | 'units'>,
  frame: { width: number; height: number },
): Array<{ x: number; y: number }> {
  void frame; // kept for call-site symmetry with zoneArea()
  return parseCoords(zone.coords);
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

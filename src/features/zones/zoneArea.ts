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
 * Legacy "Area (px/%)" cell. ZoneMinder stores `Coords` in pixels of the
 * view frame whatever `Units` says — `Units` only scales the threshold
 * fields (MinAlarmPixels etc.). Treating Percent-unit coords as percentages
 * is exactly the bug that corrupted zones before (plan F-3), so don't.
 */
export function zoneArea(
  zone: Pick<Zone, 'coords' | 'units'>,
  frame: { width: number; height: number },
): { px: number; pct: number } {
  const frameArea = frame.width * frame.height;
  const px = Math.round(polygonArea(parseCoords(zone.coords)));
  return { px, pct: frameArea > 0 ? (px / frameArea) * 100 : 0 };
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

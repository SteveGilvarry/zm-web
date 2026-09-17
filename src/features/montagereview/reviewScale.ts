/**
 * Canvas sizing for Montage Review, ported from legacy
 * `web/skins/classic/views/js/montagereview.js.php:140-162`.
 *
 * Legacy gives every monitor a `monitorNormalizeScale` of
 * `sqrt(avgArea / (W*H))` where `avgArea` is the mean pixel area over the
 * monitors on screen, then draws each canvas at
 * `W * normalizeScale * zoomScale * scale`. The normalisation makes a 4 MP
 * camera and a VGA camera take comparable room instead of the 4 MP one
 * swamping the row.
 */

export interface ReviewMonitorSize {
  width: number;
  height: number;
}

/** Mean of `W*H` over the displayed monitors; 0 when there are none. */
export function averageArea(sizes: ReviewMonitorSize[]): number {
  if (sizes.length === 0) return 0;
  const total = sizes.reduce((sum, s) => sum + s.width * s.height, 0);
  return total / sizes.length;
}

/** `sqrt(avgArea / (W*H))`, 1 when either area is degenerate. */
export function normalizeScale(size: ReviewMonitorSize, avgArea: number): number {
  const area = size.width * size.height;
  if (area <= 0 || avgArea <= 0) return 1;
  return Math.sqrt(avgArea / area);
}

/**
 * Canvas width in CSS pixels: `W * normalizeScale * zoomScale * scale`,
 * floored at 120 px so a tiny camera stays clickable.
 */
export function reviewCanvasWidth(
  size: ReviewMonitorSize,
  avgArea: number,
  scale: number,
  zoomScale = 1,
): number {
  return Math.max(120, Math.round(size.width * normalizeScale(size, avgArea) * zoomScale * scale));
}

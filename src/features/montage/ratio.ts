/**
 * Montage aspect-ratio selects, ported from legacy `montage.js`
 * (`presetRatio`, `setRatioForMonitor`, `calculateAverageMonitorsRatio`).
 *
 * Legacy sizes each tile's height from its width and the chosen ratio; here
 * the same choice is one CSS `aspect-ratio` per tile. `auto` is the preset
 * closest to the mean ratio of the monitors on screen, `real` is the
 * monitor's own shape. The ratio is always the long side over the short one,
 * so a portrait camera gets the reciprocal (legacy does the same).
 */

/** Legacy `presetRatio`, in its order; `auto` and `real` are computed. */
export const MONTAGE_RATIOS = [
  'auto', 'real',
  '1:1', '5:4', '4:3', '43:32', '11:8', '3:2', '25:16', '16:10', '5:3', '16:9',
  '50:27', '18:9', '11:5', '21:9', '64:27', '12:5', '64:25', '13:5', '11:4',
] as const;

export type MontageRatio = (typeof MONTAGE_RATIOS)[number] | string;

export const DEFAULT_MONTAGE_RATIO = 'auto';

export interface RatioSize { width: number; height: number }

/** `'16:9'` → 1.778; anything unparsable → null. */
export function ratioValue(name: string): number | null {
  const [w, h] = name.split(':').map(Number);
  if (!Number.isFinite(w) || !Number.isFinite(h) || h === 0) return null;
  return w / h;
}

/** The numeric presets, long side over short. */
const PRESET_VALUES: number[] = MONTAGE_RATIOS
  .map((name) => ratioValue(name))
  .filter((v): v is number => v != null);

/** Long side over short side, so orientation never flips the number. */
export function longSideRatio(size: RatioSize): number {
  if (size.width <= 0 || size.height <= 0) return 1;
  return size.width > size.height ? size.width / size.height : size.height / size.width;
}

/**
 * Legacy `calculateAverageMonitorsRatio`: the preset nearest the mean of the
 * displayed monitors' ratios. 16:9 when there is nothing to average.
 */
export function averageRatio(sizes: RatioSize[]): number {
  if (sizes.length === 0) return 16 / 9;
  const mean = sizes.reduce((sum, s) => sum + longSideRatio(s), 0) / sizes.length;
  return PRESET_VALUES.reduce((prev, curr) =>
    Math.abs(curr - mean) < Math.abs(prev - mean) ? curr : prev);
}

/**
 * The CSS `aspect-ratio` for one tile, or undefined when the choice cannot
 * be resolved (so the caller leaves the tile's own sizing alone).
 */
export function aspectRatioFor(
  ratio: string,
  size: RatioSize,
  avgRatio: number,
): string | undefined {
  if (size.width <= 0 || size.height <= 0) return undefined;
  if (ratio === 'real') return `${size.width} / ${size.height}`;
  const value = ratio === 'auto' ? avgRatio : ratioValue(ratio);
  if (value == null || !(value > 0)) return undefined;
  // Portrait cameras keep their orientation: the ratio applies to the long side.
  return size.width >= size.height ? `${value} / 1` : `1 / ${value}`;
}

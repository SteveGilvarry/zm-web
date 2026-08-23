const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

export function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const i = Math.min(
    BYTE_UNITS.length - 1,
    Math.floor(Math.log(bytes) / Math.log(k)),
  );
  const v = bytes / Math.pow(k, i);
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${BYTE_UNITS[i]}`;
}

/**
 * ZoneMinder's own `human_filesize()` (`web/includes/functions.php`), for the
 * classic skin.
 *
 * `formatBytes` above is this app's house style — one decimal, a space, `KB`.
 * Legacy writes `53.52GB`, `166.47kB/s`, `0.00B`: always two decimals, no
 * space, and a lowercase `k`. Verified against ZoneMinder 1.39.16's console
 * on the reference box, where our version was visibly different in every
 * storage cell.
 *
 * Two behaviours worth keeping:
 *
 * - The step-up test is `size / 1024 > 0.9`, not `>= 1`, so 1000 bytes reads
 *   as `0.98kB` rather than `1000.00B`.
 * - A **null** size prints the literal string `null` — `SUM(DiskSpace)` is
 *   NULL for a monitor with no events at all, and legacy interpolates it
 *   straight into the page. A size of *zero* is different and prints
 *   `0.00B`; conflating the two is what this UI used to get wrong.
 */
export function humanFilesize(bytes?: number | null, precision = 2): string {
  if (bytes == null) return 'null';
  let size = bytes;
  let unit = 0;
  while (size / 1024 > 0.9 && unit < LEGACY_BYTE_UNITS.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size.toFixed(precision)}${LEGACY_BYTE_UNITS[unit]}`;
}

const LEGACY_BYTE_UNITS = ['B', 'kB', 'MB', 'GB', 'TB', 'PB'];

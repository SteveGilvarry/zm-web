/**
 * Colour thresholds for the classic stat strip, straight out of
 * `skins/classic/includes/functions.php`:
 *
 * - `getDbConHTML` — warning over 90 % of `max_connections`, never danger.
 * - `getRamHTML` — memory and swap: warning over 90 %, danger over 95 %.
 * - `getStorageHTML` — warning over 95 %, danger over 98 %.
 *
 * Legacy compares strictly greater-than, so exactly 90 % is still normal.
 */
export type StatTone = 'normal' | 'warn' | 'danger';

export const RAM_THRESHOLDS = { warn: 90, danger: 95 } as const;
export const DB_THRESHOLDS = { warn: 90, danger: Infinity } as const;
export const STORAGE_THRESHOLDS = { warn: 95, danger: 98 } as const;

export function statTone(
  percent: number | null | undefined,
  thresholds: { warn: number; danger: number },
): StatTone {
  if (percent == null || !Number.isFinite(percent)) return 'normal';
  if (percent > thresholds.danger) return 'danger';
  if (percent > thresholds.warn) return 'warn';
  return 'normal';
}

/** Bootstrap's `text-warning` / `text-danger` as the classic skin renders them. */
export const STAT_TONE_CLASS: Record<StatTone, string> = {
  normal: '',
  warn: 'text-[#ffa801]',
  danger: 'text-[#ff3f34]',
};

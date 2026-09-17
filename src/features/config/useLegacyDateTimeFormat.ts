import { useDateTimeFormat } from './useDateTimeFormat';
import type { DateTimeFormatters } from '@/lib/datetime';

/**
 * Timestamps the way the ZoneMinder 1.39 UI renders them.
 *
 * Checked against the reference box: the events list shows
 * `2026-08-23 10:59:17`, not a locale-formatted `Aug 23, 2026, 10:59:17`.
 * When `ZM_*_FORMAT` is unset the legacy pages fall back to this fixed
 * layout, so the classic skin does too — the shared hook's locale default is
 * right for the modern skin and wrong here.
 *
 * A pattern configured on the server still wins; these are only the
 * fallbacks.
 */
const LEGACY_PATTERNS = {
  date: '%Y-%m-%d',
  time: '%H:%M:%S',
  dateTime: '%Y-%m-%d %H:%M:%S',
} as const;

export function useLegacyDateTimeFormat(): DateTimeFormatters {
  return useDateTimeFormat(LEGACY_PATTERNS);
}

import type { TFunction } from 'i18next';

/**
 * `Reports.Interval` is seconds (`ReportResponse.interval`, "Report interval
 * in seconds"; legacy `Report.php` defaults it to 86400). Classic prints the
 * stored number as legacy does; modern reads it in the largest whole unit.
 */
export function formatInterval(t: TFunction, seconds: number | null | undefined): string {
  if (seconds == null) return t('one-off');
  if (seconds > 0 && seconds % 86400 === 0) return t('{{count}} day', { count: seconds / 86400 });
  if (seconds > 0 && seconds % 3600 === 0) return t('{{count}} h', { count: seconds / 3600 });
  if (seconds > 0 && seconds % 60 === 0) return t('{{count}} min', { count: seconds / 60 });
  return t('{{count}} s', { count: seconds });
}

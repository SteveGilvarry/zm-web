import { useTranslation } from 'react-i18next';
import { useDateTimeFormat } from '@/features/config/useDateTimeFormat';

/** `<input type="datetime-local">` expects 'YYYY-MM-DDTHH:MM' in local time. */
export function toLocalDatetime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * `start → end` for a saved report's window, rendered through ZoneMinder's
 * own date/time patterns and server zone.
 */
export function useDateRangeFormat(): (start?: string | null, end?: string | null) => string {
  const { t } = useTranslation();
  const { formatDateTime } = useDateTimeFormat();
  return (start, end) => {
    if (!start && !end) return '—';
    return t('{{start}} → {{end}}', {
      start: (start && formatDateTime(start)) || '—',
      end: (end && formatDateTime(end)) || '—',
    });
  };
}

/**
 * A date-time zm_api will accept. `toISOString()` includes milliseconds
 * (`…T10:00:00.000Z`) and the backend answers
 * `400 Invalid start_date_time format`; the same instant without the
 * fractional part is fine. Found by the seeded e2e suite against a real
 * backend — the MSW mocks accepted anything.
 */
export function toApiDateTime(value: string | number | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toISOString().slice(0, 19)}Z`;
}

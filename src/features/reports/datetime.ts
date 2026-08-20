import i18next from '@/i18n';

/** `<input type="datetime-local">` expects 'YYYY-MM-DDTHH:MM' in local time. */
export function toLocalDatetime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDateRange(start?: string | null, end?: string | null): string {
  if (!start && !end) return '—';
  const s = start ? new Date(start).toLocaleString() : '—';
  const e = end ? new Date(end).toLocaleString() : '—';
  return i18next.t('{{start}} → {{end}}', { start: s, end: e });
}

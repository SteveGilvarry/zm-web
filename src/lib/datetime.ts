import { isStrftimePattern, strftime } from './strftime';

/**
 * Date/time rendering the way ZoneMinder configures it.
 *
 * Legacy renders every timestamp with the operator's `ZM_DATE_FORMAT_PATTERN`
 * / `ZM_TIME_FORMAT_PATTERN` / `ZM_DATETIME_FORMAT_PATTERN` (strftime) in the
 * server's `ZM_TIMEZONE`. Both are usually blank, in which case we fall back
 * to `Intl.DateTimeFormat` in the viewer's locale — the same output as before
 * this layer existed, so nothing regresses on a default install.
 *
 * Times arrive as ISO strings. Note the dev-box caveat recorded in the
 * readiness plan: builds before zm-api#16 stamp server-local `DATETIME`
 * values with `Z`, which no client-side formatting can undo — this layer
 * renders what the API sends.
 */

export interface DateTimeSettings {
  /** `ZM_DATE_FORMAT_PATTERN`, e.g. `%a %d %b %Y`. Blank = locale default. */
  datePattern?: string | null;
  /** `ZM_TIME_FORMAT_PATTERN`, e.g. `%H:%M:%S`. */
  timePattern?: string | null;
  /** `ZM_DATETIME_FORMAT_PATTERN`. */
  dateTimePattern?: string | null;
  /** `ZM_TIMEZONE` (IANA). Blank = the viewer's zone. */
  timeZone?: string | null;
  /** Active UI locale. */
  locale?: string;
}

export interface DateTimeFormatters {
  formatDate: (value: DateInput) => string;
  formatTime: (value: DateInput) => string;
  formatDateTime: (value: DateInput) => string;
  /** The zone timestamps are rendered in, or undefined for the viewer's. */
  timeZone?: string;
  /** True when the server's zone differs from the viewer's — worth labelling. */
  showsServerZone: boolean;
}

export type DateInput = string | number | Date | null | undefined;

export function toDate(value: DateInput): Date | null {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function intl(
  date: Date,
  locale: string | undefined,
  timeZone: string | undefined,
  opts: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(locale, { ...(timeZone ? { timeZone } : {}), ...opts }).format(date);
}

export function viewerTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

export function makeDateTimeFormatters(settings: DateTimeSettings = {}): DateTimeFormatters {
  const { locale } = settings;
  const timeZone = settings.timeZone?.trim() || undefined;
  const opts = { timeZone, locale };

  const render = (
    value: DateInput,
    pattern: string | null | undefined,
    fallback: Intl.DateTimeFormatOptions,
  ): string => {
    const date = toDate(value);
    if (!date) return '';
    if (isStrftimePattern(pattern)) return strftime(pattern, date, opts);
    return intl(date, locale, timeZone, fallback);
  };

  return {
    formatDate: (v) => render(v, settings.datePattern, { dateStyle: 'medium' }),
    formatTime: (v) => render(v, settings.timePattern, { timeStyle: 'medium', hour12: false }),
    formatDateTime: (v) =>
      render(v, settings.dateTimePattern, { dateStyle: 'medium', timeStyle: 'medium', hour12: false }),
    timeZone,
    showsServerZone: Boolean(timeZone && timeZone !== viewerTimeZone()),
  };
}

/** Formatters with no ZoneMinder configuration — locale defaults only. */
export const defaultFormatters = makeDateTimeFormatters();

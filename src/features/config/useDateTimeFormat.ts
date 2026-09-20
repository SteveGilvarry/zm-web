import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getLocale } from '@/api/locale';
import { useAuthStore } from '@/stores/auth';
import { makeDateTimeFormatters, type DateTimeFormatters } from '@/lib/datetime';

/**
 * Timestamp formatters wired to ZoneMinder's own settings: the three
 * strftime patterns and the server's effective timezone, rendered in the
 * active UI locale. Blank patterns (the common case) mean locale defaults,
 * which is what every page did before this hook existed.
 *
 * Source is `GET /api/v3/system/locale` (zm-api#33) — one request that also
 * resolves `ZM_TIMEZONE` against the host clock, which reading the raw
 * `ZM_*` config rows could not do. A zm-api without that route 404s and the
 * formatters stay on locale defaults.
 *
 * Pages should use this instead of calling `toLocaleString()` directly so an
 * operator who sets a format in Options sees it everywhere, and so a remote
 * operator can be shown the server's clock.
 *
 * `defaults` supplies patterns to use when the server names none. The modern
 * skin wants the viewer's locale in that case; the classic skin wants what
 * ZoneMinder renders, which is a fixed `2026-08-23 10:59:17` — see
 * `useLegacyDateTimeFormat`. A pattern from the server always wins over both.
 */
export function useDateTimeFormat(defaults?: {
  date?: string;
  time?: string;
  dateTime?: string;
}): DateTimeFormatters {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? undefined;
  const { isAuthenticated } = useAuthStore();

  const { data } = useQuery({
    queryKey: ['system', 'locale'],
    queryFn: getLocale,
    enabled: isAuthenticated,
    staleTime: 30 * 60_000,
    retry: false,
  });

  return useMemo(
    () =>
      makeDateTimeFormatters({
        datePattern: data?.date_format || defaults?.date,
        timePattern: data?.time_format || defaults?.time,
        dateTimePattern: data?.datetime_format || defaults?.dateTime,
        timeZone: data?.timezone,
        locale,
      }),
    [data, locale, defaults?.date, defaults?.time, defaults?.dateTime],
  );
}

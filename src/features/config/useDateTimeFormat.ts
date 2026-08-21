import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { makeDateTimeFormatters, type DateTimeFormatters } from '@/lib/datetime';
import { useZmConfig } from './useZmConfig';

/**
 * Timestamp formatters wired to ZoneMinder's own settings: the three
 * strftime patterns and `ZM_TIMEZONE`, rendered in the active UI locale.
 * Blank config (the common case) means locale defaults in the viewer's zone,
 * which is what every page did before this hook existed.
 *
 * Pages should use this instead of calling `toLocaleString()` directly so an
 * operator who sets a format in Options sees it everywhere, and so a remote
 * operator can be shown the server's clock.
 */
export function useDateTimeFormat(): DateTimeFormatters {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? undefined;
  const datePattern = useZmConfig('ZM_DATE_FORMAT_PATTERN', '');
  const timePattern = useZmConfig('ZM_TIME_FORMAT_PATTERN', '');
  const dateTimePattern = useZmConfig('ZM_DATETIME_FORMAT_PATTERN', '');
  const timeZone = useZmConfig('ZM_TIMEZONE', '');

  return useMemo(
    () => makeDateTimeFormatters({ datePattern, timePattern, dateTimePattern, timeZone, locale }),
    [datePattern, timePattern, dateTimePattern, timeZone, locale],
  );
}

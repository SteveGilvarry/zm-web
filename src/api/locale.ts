import { apiGet } from './client';

/**
 * Server locale — one request for everything timestamp rendering needs
 * (zm-api#33). Replaces reading the four `ZM_*` config rows one at a time:
 * the backend resolves `ZM_TIMEZONE` against the host zone for us and hands
 * back the three strftime patterns alongside it.
 *
 * Needs a zm_api that serves `GET /api/v3/system/locale`; older builds 404.
 */
export interface LocaleResponse {
  /** Effective IANA zone, e.g. `Australia/Melbourne`. Null if unresolvable. */
  timezone?: string | null;
  /** Current offset as `+10:00`. */
  utc_offset: string;
  utc_offset_seconds: number;
  /** `ZM_DATE_FORMAT_PATTERN` — blank on a default install. */
  date_format?: string | null;
  /** `ZM_DATETIME_FORMAT_PATTERN`. */
  datetime_format?: string | null;
  /** `ZM_TIME_FORMAT_PATTERN`. */
  time_format?: string | null;
}

export async function getLocale(): Promise<LocaleResponse> {
  return apiGet<LocaleResponse>('/system/locale');
}

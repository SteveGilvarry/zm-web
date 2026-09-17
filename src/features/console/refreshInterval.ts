/** The ZoneMinder config row the console's auto-refresh cadence comes from. */
export const CONSOLE_REFRESH_CONFIG = 'ZM_WEB_H_REFRESH_MAIN';

/**
 * Turn `ZM_WEB_H_REFRESH_MAIN` (seconds) into a TanStack Query
 * `refetchInterval`.
 *
 * Legacy reads the value for the active bandwidth profile and only arms the
 * timer when it is above zero (`views/js/console.js.php:13`,
 * `views/js/console.js:509`), so **0 means never auto-refresh** — not
 * "refresh as fast as possible". The bandwidth switcher is out of scope
 * here, so the high-bandwidth row stands in for all three.
 *
 * `raw` being undefined means the row is absent (older schemas have only
 * `ZM_WEB_REFRESH_MAIN`, newer boxes only the per-profile rows), which is a
 * different thing from it being 0: an absent row keeps the dashboard's own
 * cadence rather than turning refresh off. A value that is not a number, or
 * is negative, is treated the same way as absent.
 */
export function consoleRefreshInterval(
  raw: string | undefined,
  fallbackMs: number,
): number | false {
  if (raw == null || raw.trim() === '') return fallbackMs;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0) return fallbackMs;
  if (seconds === 0) return false;
  return seconds * 1000;
}

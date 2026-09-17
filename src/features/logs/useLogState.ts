import { useQueries } from '@tanstack/react-query';
import { listLogs, LOG_LEVEL } from '@/api/logs';
import { useAuthStore } from '@/stores/auth';
import { useZmConfigTable } from '@/features/config/useZmConfig';

/** `logState()` in `skins/classic/includes/functions.php:1648`. */
export type LogState = 'ok' | 'alert' | 'alarm';

export interface LogLevelCounts {
  /** FATAL and PANIC together, as legacy folds PANIC into FATAL. */
  fatal: number;
  error: number;
  warning: number;
}

/** `ZM_LOG_ALERT_*_COUNT` / `ZM_LOG_ALARM_*_COUNT`; 0 disables that check. */
export interface LogStateThresholds {
  alertFatal: number; alarmFatal: number;
  alertError: number; alarmError: number;
  alertWarning: number; alarmWarning: number;
}

/**
 * Legacy `logState()`: walk the levels from most to least severe; the first
 * count at or above its **alarm** threshold makes the whole state `alarm` and
 * stops the walk, and any count at or above its **alert** threshold leaves
 * `alert`. A zero threshold means "never trip on this level".
 */
export function logStateFrom(counts: LogLevelCounts, th: LogStateThresholds): LogState {
  const checks: Array<[number, number, number]> = [
    [counts.fatal, th.alertFatal, th.alarmFatal],
    [counts.error, th.alertError, th.alarmError],
    [counts.warning, th.alertWarning, th.alarmWarning],
  ];
  let state: LogState = 'ok';
  for (const [count, alert, alarm] of checks) {
    if (alarm && count >= alarm) return 'alarm';
    if (alert && count >= alert) state = 'alert';
  }
  return state;
}

/** ZoneMinder's own defaults (`ConfigData.pm`). */
const DEFAULT_THRESHOLDS: LogStateThresholds = {
  alertFatal: 0, alarmFatal: 1,
  alertError: 1, alarmError: 10,
  alertWarning: 1, alarmWarning: 100,
};

function num(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Legacy `ZM_LOG_CHECK_PERIOD` — the window `logState()` counts over. */
const DEFAULT_CHECK_PERIOD_S = 900;

/**
 * The colour the legacy navbar gives its Log item: green while nothing is
 * wrong, amber at the alert counts, red at the alarm counts.
 *
 * Legacy runs one grouped SQL count; `GET /logs` has no group-by, so this is
 * four `page_size: 1` reads whose `total` is the count — one per severity,
 * PANIC folded into FATAL. They share a query key, are cached for the check
 * period and refetch on it, so the nav costs four cheap calls a minute.
 */
export function useLogState(enabled: boolean): LogState {
  const { isAuthenticated } = useAuthStore();
  const { data: configs } = useZmConfigTable();
  const on = enabled && isAuthenticated;

  const checkPeriod = num(configs?.ZM_LOG_CHECK_PERIOD, DEFAULT_CHECK_PERIOD_S);
  const levels = [LOG_LEVEL.PANIC, LOG_LEVEL.FATAL, LOG_LEVEL.ERROR, LOG_LEVEL.WARNING];
  const results = useQueries({
    queries: levels.map((level) => ({
      queryKey: ['logState', level, checkPeriod],
      // The window is relative to the moment of the request, not of the
      // render, so it moves with each refetch without churning the key.
      queryFn: () => listLogs({
        level,
        start: Math.floor(Date.now() / 1000) - checkPeriod,
        page: 1,
        page_size: 1,
      }),
      enabled: on,
      staleTime: checkPeriod * 1000,
      refetchInterval: checkPeriod * 1000,
      retry: false,
    })),
  });

  const total = (i: number) => results[i].data?.total ?? 0;
  const counts: LogLevelCounts = {
    fatal: total(0) + total(1),
    error: total(2),
    warning: total(3),
  };

  const thresholds: LogStateThresholds = configs ? {
    alertFatal: num(configs.ZM_LOG_ALERT_FAT_COUNT, DEFAULT_THRESHOLDS.alertFatal),
    alarmFatal: num(configs.ZM_LOG_ALARM_FAT_COUNT, DEFAULT_THRESHOLDS.alarmFatal),
    alertError: num(configs.ZM_LOG_ALERT_ERR_COUNT, DEFAULT_THRESHOLDS.alertError),
    alarmError: num(configs.ZM_LOG_ALARM_ERR_COUNT, DEFAULT_THRESHOLDS.alarmError),
    alertWarning: num(configs.ZM_LOG_ALERT_WAR_COUNT, DEFAULT_THRESHOLDS.alertWarning),
    alarmWarning: num(configs.ZM_LOG_ALARM_WAR_COUNT, DEFAULT_THRESHOLDS.alarmWarning),
  } : DEFAULT_THRESHOLDS;

  return logStateFrom(counts, thresholds);
}

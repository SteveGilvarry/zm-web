import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMonitorStatus } from '@/api/monitorStatus';
import { useDocumentVisible } from '@/hooks/useDocumentVisible';
import { alarmTransition, parseAlarmState, type AlarmState } from './alarmWatch';

/**
 * Legacy asks zms for the stream status every second. zm-api's limiter on
 * the reference box allows one request a second for the whole app, which
 * the watch page also spends on the shared status poll, events and PTZ, so
 * this polls at 2 s, and only while the tab is visible.
 */
export const ALARM_STATE_POLL_MS = 2_000;

/**
 * When the per-monitor route has no `alarm_state` (zmc is down, or the build
 * predates zm-api#139) the State line falls back to the shared 5 s status;
 * this only checks back now and then for zmc returning.
 */
export const ALARM_STATE_RECHECK_MS = 30_000;

export interface MonitorAlarmStatus {
  /** Shared-memory state, or null when the route does not report one. */
  state: AlarmState | null;
  /** Alarms switched off with `zmu -n`; null when unknown. */
  alarmsDisabled: boolean | null;
  /** zmc is analysing right now; null when unknown. */
  analysing: boolean | null;
  refetch: () => void;
}

export interface AlarmTransitionHandlers {
  /** The monitor went into Alarm or Alert. */
  onStart?: () => void;
  /** The monitor left Alarm or Alert. */
  onEnd?: () => void;
}

/**
 * One monitor's live alarm state from `GET /monitor-status/{id}`, with
 * callbacks on the way into and out of an alarm (MonitorStream.js
 * `setAlarmState`).
 */
export function useMonitorAlarmState(
  monitorId: number,
  enabled: boolean,
  handlers: AlarmTransitionHandlers = {},
): MonitorAlarmStatus {
  // No grace period: a hidden tab has no reason to keep asking.
  const visible = useDocumentVisible(0);
  const q = useQuery({
    queryKey: ['monitorStatus', monitorId],
    queryFn: () => getMonitorStatus(monitorId),
    enabled,
    retry: false,
    refetchInterval: (query) => {
      if (!visible) return false;
      return query.state.data?.alarm_state != null ? ALARM_STATE_POLL_MS : ALARM_STATE_RECHECK_MS;
    },
  });

  const state = parseAlarmState(q.data?.alarm_state);

  const handlersRef = useRef(handlers);
  useEffect(() => { handlersRef.current = handlers; });

  const previous = useRef<AlarmState | null>(null);
  useEffect(() => {
    const transition = alarmTransition(previous.current, state);
    previous.current = state;
    if (transition === 'start') handlersRef.current.onStart?.();
    else if (transition === 'end') handlersRef.current.onEnd?.();
  }, [state]);

  const { refetch } = q;
  return {
    state,
    alarmsDisabled: q.data?.alarms_disabled ?? null,
    analysing: q.data?.analysing ?? null,
    refetch: () => { void refetch(); },
  };
}

import type { MonitorStatusRecord } from '@/api/monitorStatus';

/**
 * Legacy alarm alerting (`ZM_WEB_POPUP_ON_ALARM`, `ZM_WEB_SOUND_ON_ALARM`,
 * `ZM_WEB_ALARM_SOUND`): when a monitor transitions into Alarm the console
 * pops that monitor's watch window and/or plays a sound. The transition
 * detection is pure so it can be tested without timers or audio.
 */

/** ZoneMinder's runtime states that count as "alarming". */
const ALARM_STATES = new Set(['Alarm', 'Alert']);

export function isAlarming(status: Pick<MonitorStatusRecord, 'status'> | undefined): boolean {
  return Boolean(status && ALARM_STATES.has(String(status.status)));
}

/**
 * Monitor ids that just entered an alarm state, given the previous and the
 * current status snapshots. A monitor that was already alarming does not
 * fire again; one that disappears from the list is forgotten.
 */
export function newlyAlarming(
  previous: ReadonlyMap<number, string>,
  current: readonly MonitorStatusRecord[],
): number[] {
  const fired: number[] = [];
  for (const s of current) {
    const was = previous.get(s.monitor_id);
    const now = String(s.status);
    if (ALARM_STATES.has(now) && (was === undefined || !ALARM_STATES.has(was))) {
      fired.push(s.monitor_id);
    }
  }
  return fired;
}

export function statusMap(list: readonly MonitorStatusRecord[]): Map<number, string> {
  return new Map(list.map((s) => [s.monitor_id, String(s.status)]));
}

/** Where legacy's alarm sounds live: `web/sounds/<ZM_WEB_ALARM_SOUND>`. */
export function alarmSoundUrl(fileName: string): string {
  return `/zm/sounds/${encodeURIComponent(fileName)}`;
}

/**
 * One monitor's shared-memory alarm state, as `GET /monitor-status/{id}`
 * reports it (`zmu -s`): ZoneMinder's `STATE_*` names, lower-cased.
 */
export type AlarmState = 'idle' | 'prealarm' | 'alarm' | 'alert';

const ALARM_STATE_VALUES: readonly AlarmState[] = ['idle', 'prealarm', 'alarm', 'alert'];

/** The wire value as an `AlarmState`, or null when absent or unknown. */
export function parseAlarmState(raw: string | null | undefined): AlarmState | null {
  const v = raw?.toLowerCase();
  return ALARM_STATE_VALUES.find((s) => s === v) ?? null;
}

/** MonitorStream.js `isAlarmed`: Alarm and Alert count, Prealarm does not. */
export function isAlarmedState(state: AlarmState | null): boolean {
  return state === 'alarm' || state === 'alert';
}

/**
 * MonitorStream.js `setAlarmState`: `start` when the monitor goes into Alarm
 * or Alert, `end` when it leaves them, null otherwise. A first reading that
 * is already alarmed counts as a start, as in legacy, whose last state
 * starts out unset.
 */
export function alarmTransition(previous: AlarmState | null, next: AlarmState | null): 'start' | 'end' | null {
  const was = isAlarmedState(previous);
  const is = isAlarmedState(next);
  if (is && !was) return 'start';
  if (!is && was) return 'end';
  return null;
}

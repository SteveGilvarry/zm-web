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

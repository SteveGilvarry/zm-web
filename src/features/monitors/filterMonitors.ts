import { isDeleted, type Monitor } from '@/types';

/** The Status chip's token for soft-deleted monitors (legacy's `Deleted` pseudo-status). */
export const DELETED_TOKEN = 'deleted';

export interface MonitorFilterSelections {
  groupIds: number[];
  capturing: string[];
  analysing: string[];
  recording: string[];
  status: string[];
  source: string[];
  monitorIds: number[];
}

/**
 * Apply every chip's selections to the monitor list. Selections within a
 * chip OR-combine (e.g. Capturing: Always OR OnAlarm); different chips
 * AND-combine (Group X AND Capturing Always). An empty chip means "no
 * filter from that chip" — every monitor passes that gate.
 */
export function filterMonitors(
  monitors: Monitor[],
  selections: MonitorFilterSelections,
  /** Map of group id → monitor ids in that group. */
  groupMembership: Map<number, Set<number>>,
): Monitor[] {
  const {
    groupIds, capturing, analysing, recording, status, source, monitorIds,
  } = selections;

  // Pre-compute the set of monitor ids reachable through the selected groups.
  // Empty groupIds ⇒ all monitors pass.
  const groupGate: Set<number> | null =
    groupIds.length === 0
      ? null
      : groupIds.reduce<Set<number>>((acc, gid) => {
          const ids = groupMembership.get(gid);
          if (ids) ids.forEach((id) => acc.add(id));
          return acc;
        }, new Set<number>());

  return monitors.filter((m) => {
    if (groupGate && !groupGate.has(m.id))                         return false;
    if (capturing.length && !capturing.includes(m.capturing))      return false;
    if (analysing.length && !analysing.includes(m.analysing))      return false;
    if (recording.length && !recording.includes(m.recording))      return false;
    if (source.length    && !source.includes(m.type))              return false;
    if (monitorIds.length && !monitorIds.includes(m.id))           return false;

    if (status.length) {
      // Legacy: `(… AND Status IN …) OR Deleted=true`. A deleted monitor
      // shows only while Deleted is picked, whatever else is; a live one
      // needs one of the other tokens.
      if (isDeleted(m)) return status.includes(DELETED_TOKEN);
      const live = status.filter((s) => s !== DELETED_TOKEN);
      if (live.length === 0) return false;
      const token = m.capturing !== 'None' ? 'active' : 'disabled';
      if (!live.includes(token)) return false;
    }
    // With no status picked, deleted rows pass like any other: the classic
    // row runs its own `Deleted` logic after this, and the modern hook only
    // puts deleted rows in the pool while Deleted is picked.
    return true;
  });
}

import type { Monitor } from '@/types';

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
      const isActive = m.capturing !== 'None';
      const token = isActive ? 'active' : 'disabled';
      if (!status.includes(token)) return false;
    }
    return true;
  });
}

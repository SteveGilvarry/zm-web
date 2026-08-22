import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listGroups, listGroupMonitors, type Group } from '@/api/groups';
import { useAuthStore } from '@/stores/auth';
import { useMonitorFilterStore } from '@/stores/monitorFilter';
import type { Monitor } from '@/types';
import { filterMonitors } from './filterMonitors';

export interface MonitorFilterResult {
  /** `monitors` with every chip's selections applied. */
  filtered: Monitor[];
  /** How many chip selections are narrowing the list right now. */
  activeCount: number;
  /** Groups for the Group chip. */
  groups: Group[];
  /** gid → monitor ids, shared with the chip UI. */
  groupMembership: Map<number, Set<number>>;
}

/**
 * The monitor filter, without a UI.
 *
 * The selections live in `useMonitorFilterStore` (sessionStorage), so any
 * page can apply them whether or not the chip bar is on screen — the console
 * keeps its bar behind a disclosure and still has to render the right wall
 * on first paint. `MonitorFilterBar` renders from this same hook.
 */
export function useMonitorFilter(monitors: Monitor[]): MonitorFilterResult {
  const { isAuthenticated } = useAuthStore();

  const groupIds   = useMonitorFilterStore((s) => s.groupIds);
  const capturing  = useMonitorFilterStore((s) => s.capturing);
  const analysing  = useMonitorFilterStore((s) => s.analysing);
  const recording  = useMonitorFilterStore((s) => s.recording);
  const status     = useMonitorFilterStore((s) => s.status);
  const source     = useMonitorFilterStore((s) => s.source);
  const monitorIds = useMonitorFilterStore((s) => s.monitorIds);

  const groupsQ = useQuery({
    queryKey: ['groups'],
    queryFn: () => listGroups({ page: 1, page_size: 200 }),
    enabled: isAuthenticated,
  });
  const groupMonitorsQ = useQuery({
    queryKey: ['groups-monitors'],
    queryFn: () => listGroupMonitors({ page: 1, page_size: 1000 }),
    enabled: isAuthenticated,
  });

  const groupMonitors = groupMonitorsQ.data?.items;
  const groupMembership = useMemo(() => {
    const map = new Map<number, Set<number>>();
    for (const gm of groupMonitors ?? []) {
      if (!map.has(gm.group_id)) map.set(gm.group_id, new Set<number>());
      map.get(gm.group_id)!.add(gm.monitor_id);
    }
    return map;
  }, [groupMonitors]);

  const filtered = useMemo(
    () => filterMonitors(monitors, {
      groupIds, capturing, analysing, recording, status, source, monitorIds,
    }, groupMembership),
    [monitors, groupIds, capturing, analysing, recording, status, source, monitorIds, groupMembership],
  );

  return {
    filtered,
    activeCount:
      groupIds.length + capturing.length + analysing.length +
      recording.length + status.length + source.length + monitorIds.length,
    groups: groupsQ.data?.items ?? [],
    groupMembership,
  };
}

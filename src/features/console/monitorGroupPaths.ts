import { useQuery } from '@tanstack/react-query';
import { listGroups, listGroupMonitors, type Group, type GroupMonitor } from '@/api/groups';
import { useAuthStore } from '@/stores/auth';

/** One ancestry line under a monitor's name: root first, the group itself last. */
export type GroupPath = Group[];

/**
 * `ajax/console.php:416-437`: one line per group the monitor is in, each line
 * the group's parents then the group itself, and every segment a link. Cycles
 * in `parent_id` (which the database does not forbid) stop the walk rather
 * than hang it.
 */
export function groupPathsFor(
  monitorId: number,
  groups: Group[],
  groupMonitors: GroupMonitor[],
): GroupPath[] {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const mine = groupMonitors
    .filter((gm) => gm.monitor_id === monitorId)
    .map((gm) => byId.get(gm.group_id))
    .filter((g): g is Group => g != null);

  return mine.map((group) => {
    const path: Group[] = [group];
    const seen = new Set<number>([group.id]);
    let parentId = group.parent_id ?? null;
    while (parentId != null && !seen.has(parentId)) {
      const parent = byId.get(parentId);
      if (!parent) break;
      seen.add(parent.id);
      path.unshift(parent);
      parentId = parent.parent_id ?? null;
    }
    return path;
  });
}

/**
 * Group ancestry per monitor for the console's Name cell. Reuses the query
 * keys the filter row already loads (`groups`, `groups-monitors`), so the
 * data is in cache by the time the table paints.
 */
export function useMonitorGroupPaths(enabled: boolean) {
  const { isAuthenticated } = useAuthStore();
  const on = enabled && isAuthenticated;
  const groupsQ = useQuery({
    queryKey: ['groups'],
    queryFn: () => listGroups({ page: 1, page_size: 200 }),
    enabled: on,
  });
  const groupMonitorsQ = useQuery({
    queryKey: ['groups-monitors'],
    queryFn: () => listGroupMonitors({ page: 1, page_size: 1000 }),
    enabled: on,
  });
  const groups = groupsQ.data?.items ?? [];
  const groupMonitors = groupMonitorsQ.data?.items ?? [];
  return (monitorId: number): GroupPath[] =>
    (on ? groupPathsFor(monitorId, groups, groupMonitors) : []);
}

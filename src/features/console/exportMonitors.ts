import { getAllMonitors } from '@/api/monitors';
import { listGroupMonitors, listGroups, type Group, type GroupMonitor } from '@/api/groups';
import { listZonesForMonitor, type Zone } from '@/api/zones';
import { getVersion } from '@/api/system';
import { isDeleted, type Monitor } from '@/types';

/**
 * Fields legacy drops from each monitor (`exportMonitorsJSON`,
 * ajax/console.php): instance-specific, no use on another box. Here under
 * the API's snake_case names, which are what the export carries.
 */
const MONITOR_EXCLUDE = ['id', 'deleted', 'server_id', 'storage_id', 'sequence', 'zone_count'] as const;
const ZONE_EXCLUDE = ['id', 'monitor_id'] as const;

export const MONITORS_EXPORT_FILENAME = 'zm_monitors_export.json';

export interface MonitorsExport {
  version: string;
  exported: string;
  monitors: Array<Record<string, unknown> & { Groups: string[]; Zones: Record<string, unknown>[] }>;
}

function omit<T extends object>(row: T, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  for (const k of keys) delete out[k];
  return out;
}

/**
 * Legacy's export document: `{version, exported, monitors[]}`, live monitors
 * in Sequence order, each with its group names and its zones.
 */
export function buildMonitorsExport(input: {
  version: string;
  now: Date;
  monitors: Monitor[];
  zonesByMonitor: Record<number, Zone[]>;
  groups: Group[];
  groupMonitors: GroupMonitor[];
}): MonitorsExport {
  const groupName = new Map(input.groups.map((g) => [g.id, g.name]));
  const groupsOf = new Map<number, string[]>();
  for (const gm of input.groupMonitors) {
    const name = groupName.get(gm.group_id);
    if (name == null) continue;
    if (!groupsOf.has(gm.monitor_id)) groupsOf.set(gm.monitor_id, []);
    groupsOf.get(gm.monitor_id)!.push(name);
  }
  const live = input.monitors
    .filter((m) => !isDeleted(m))
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0) || a.id - b.id);
  return {
    version: input.version,
    exported: input.now.toISOString(),
    monitors: live.map((m) => ({
      ...omit(m, MONITOR_EXCLUDE),
      Groups: groupsOf.get(m.id) ?? [],
      Zones: (input.zonesByMonitor[m.id] ?? []).map((z) => omit(z, ZONE_EXCLUDE)),
    })),
  };
}

/** Fetch everything the export needs and build it. */
export async function fetchMonitorsExport(now: Date = new Date()): Promise<MonitorsExport> {
  const [monitors, groups, groupMonitors, version] = await Promise.all([
    getAllMonitors(),
    listGroups({ page: 1, page_size: 1000 }),
    listGroupMonitors({ page: 1, page_size: 10000 }),
    getVersion(),
  ]);
  const live = monitors.filter((m) => !isDeleted(m));
  const zones = await Promise.all(
    live.map((m) => listZonesForMonitor(m.id, { page: 1, page_size: 1000 }).then((r) => [m.id, r.items] as const)),
  );
  return buildMonitorsExport({
    version: version.version,
    now,
    monitors: live,
    zonesByMonitor: Object.fromEntries(zones),
    groups: groups.items,
    groupMonitors: groupMonitors.items,
  });
}

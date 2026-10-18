import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listGroups, listGroupMonitors, type Group } from '@/api/groups';
import { listServers, type Server } from '@/api/servers';
import { getStorageList } from '@/api/storage';
import type { ZmStorage } from '@/types';
import { useAuthStore } from '@/stores/auth';
import { useMonitorFilterStore } from '@/stores/monitorFilter';
import { useMonitorFilterRowStore } from '@/stores/monitorFilterRow';
import { getAllMonitors } from '@/api/monitors';
import { isDeleted, type Monitor } from '@/types';
import { filterMonitors } from './filterMonitors';
import { useMonitorStatuses, type MonitorRuntime } from './useMonitorStatuses';

/**
 * The legacy `_monitor_filters.php` row, in this order.
 * Group / Capturing / Analysing / Recording / Monitor are shared with the
 * modern chip bar through `useMonitorFilterStore` (so `?group=` and a chip
 * picked on Console carry over). Name / Source are regexes, Status is the
 * *runtime* state (`/monitor-status`) plus `Deleted`, and Server / Storage
 * only show on a multi-server or multi-storage box; the chip bar models none
 * of those, so they live in `useMonitorFilterRowStore`. Both stores persist,
 * as legacy's `zmFilter_*` cookies do, so every page mounting the row sees
 * the same selection. This hook is the only reader and writer of the second.
 */
export type FilterRowField =
  | 'groupId' | 'name' | 'capturing' | 'analysing' | 'recording' | 'status' | 'source' | 'monitorId'
  // Legacy renders these two only when the box has more than one.
  | 'serverId' | 'storageId';

/**
 * One string per field. `monitorId` may hold several ids joined with commas
 * (`"3,7"`): legacy's Monitor select is multi-select and SELECT on the console
 * narrows to every checked row (`?MonitorId[]=3&MonitorId[]=7`).
 */
export type FilterRowValues = Record<FilterRowField, string>;

/** `"3,7"` → `[3, 7]`; blanks and non-numbers are dropped. */
export function parseIdList(value: string): number[] {
  return value.split(',').map((v) => Number(v.trim())).filter((n) => Number.isInteger(n) && n > 0);
}

export const FILTER_ROW_FIELDS: readonly FilterRowField[] = [
  'groupId', 'name', 'capturing', 'analysing', 'recording', 'serverId', 'storageId',
  'status', 'source', 'monitorId',
];

/** The fields legacy renders as Chosen multi-selects (`multiple="multiple"`). */
export const FILTER_ROW_MULTI_FIELDS: readonly FilterRowField[] = [
  'groupId', 'capturing', 'analysing', 'recording', 'serverId', 'storageId', 'status', 'monitorId',
];

/** `"a,b"` → `['a','b']`; blanks dropped. */
export function splitValues(value: string): string[] {
  return value.split(',').map((v) => v.trim()).filter(Boolean);
}

/**
 * Wire values of the legacy Status select; labels are translated in the
 * component. `Deleted` is legacy's pseudo-status (`monitorStatusFilterSql`):
 * on its own it lists only soft-deleted monitors, beside real statuses it
 * adds them, and unselected the list stays live monitors only.
 */
export const RUNTIME_STATUS_OPTIONS = ['Unknown', 'NotRunning', 'Running', 'Connected', 'Deleted'] as const;
export const DELETED_STATUS = 'Deleted';

export const CAPTURING_OPTIONS = ['None', 'Ondemand', 'Always'] as const;
export const ANALYSING_OPTIONS = ['None', 'Always'] as const;
export const RECORDING_OPTIONS = ['None', 'OnMotion', 'Always'] as const;

/** "text or regular expression": a bad regex degrades to a substring match. */
export function matchesText(pattern: string, value: string | null | undefined): boolean {
  if (!pattern) return true;
  const v = value ?? '';
  try {
    return new RegExp(pattern, 'i').test(v);
  } catch {
    return v.toLowerCase().includes(pattern.toLowerCase());
  }
}

/**
 * Legacy "Source" column text: host for network cameras, device for local
 * ones. Ffmpeg monitors usually carry the whole URL in `path` and no host,
 * so the hostname is lifted out of it (legacy does the same in `Monitor.php`).
 */
export function monitorSource(m: Pick<Monitor, 'host' | 'device' | 'path' | 'type'>): string {
  if (m.type === 'Local') return m.device ?? '';
  if (m.host) return m.host;
  if (!m.path) return '';
  try {
    return new URL(m.path).hostname || m.path;
  } catch {
    return m.path;
  }
}

/** Apply the three hook-local fields (the store fields go through `filterMonitors`). */
export function applyLocalFilters(
  monitors: Monitor[],
  values: Pick<FilterRowValues, 'name' | 'source' | 'status'> & Partial<Pick<FilterRowValues, 'serverId' | 'storageId'>>,
  runtimeById: Record<number, MonitorRuntime>,
): Monitor[] {
  // Every select is multi (legacy's Chosen widgets), so these arrive
  // comma-joined and OR-combine within a field.
  const picked = splitValues(values.status);
  const includeDeleted = picked.includes(DELETED_STATUS);
  const statuses = picked.filter((s) => s !== DELETED_STATUS);
  const serverIds = splitValues(values.serverId ?? '');
  const storageIds = splitValues(values.storageId ?? '');
  return monitors.filter((m) => {
    if (!matchesText(values.name, m.name)) return false;
    // Legacy tries `Source()` first, then the full `Path` (credentials and all).
    if (values.source && !matchesText(values.source, monitorSource(m)) && !matchesText(values.source, m.path)) {
      return false;
    }
    if (isDeleted(m)) {
      // `(… AND Status IN …) OR Deleted=true`: a deleted monitor passes
      // whatever else the Status select holds, and only when Deleted is in it.
      if (!includeDeleted) return false;
    } else {
      if (includeDeleted && statuses.length === 0) return false;
      if (statuses.length) {
        // `COALESCE(Status, 'NotRunning')`: a monitor with no runtime row
        // (Capturing=None never gets one) counts as Not Running.
        const status = runtimeById[m.id]?.status ?? 'NotRunning';
        if (!statuses.includes(status)) return false;
      }
    }
    if (serverIds.length && !serverIds.includes(String(m.server_id ?? 0))) return false;
    if (storageIds.length && !storageIds.includes(String(m.storage_id ?? 0))) return false;
    return true;
  });
}

/** One entry of the GroupId select: legacy indents children under their parent. */
export interface GroupOption {
  id: number;
  name: string;
  depth: number;
}

/**
 * `Group::get_dropdown_options`: groups sorted by lower-cased name, each
 * followed by its children (recursively), depth counted from the root.
 * Groups whose parent is missing are treated as roots so none disappear.
 */
export function groupDropdownOptions(groups: Group[]): GroupOption[] {
  const byName = [...groups].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  const ids = new Set(groups.map((g) => g.id));
  const children = new Map<number, Group[]>();
  for (const g of byName) {
    if (g.parent_id != null && ids.has(g.parent_id)) {
      if (!children.has(g.parent_id)) children.set(g.parent_id, []);
      children.get(g.parent_id)!.push(g);
    }
  }
  const out: GroupOption[] = [];
  const seen = new Set<number>();
  const walk = (g: Group, depth: number) => {
    if (seen.has(g.id)) return; // a parent loop in the data must not hang the page
    seen.add(g.id);
    out.push({ id: g.id, name: g.name, depth });
    for (const c of children.get(g.id) ?? []) walk(c, depth + 1);
  };
  for (const g of byName) if (g.parent_id == null || !ids.has(g.parent_id)) walk(g, 0);
  return out;
}

/**
 * `Group::get_group_sql`: the picked groups plus their direct children.
 * Legacy goes one level down, not the whole subtree, and so does this.
 */
export function expandGroupIds(picked: number[], groups: Group[]): number[] {
  if (picked.length === 0) return picked;
  const set = new Set(picked);
  for (const g of groups) if (g.parent_id != null && picked.includes(g.parent_id)) set.add(g.id);
  return [...set];
}

export interface MonitorFilterRowState {
  groups: Group[];
  /** The GroupId select's options, tree-ordered with a depth for the indent. */
  groupOptions: GroupOption[];
  /** Legacy shows the Server select only when the box has more than one. */
  servers: Server[];
  /** Same rule for Storage. */
  storages: ZmStorage[];
  values: FilterRowValues;
  /** The same selections as `values`, split — every select is multi. */
  valuesMulti: Record<FilterRowField, string[]>;
  set: (field: FilterRowField, value: string) => void;
  /** Set a multi-select's whole selection. */
  setMulti: (field: FilterRowField, values: string[]) => void;
  clear: (field: FilterRowField) => void;
  reset: () => void;
  /**
   * The Monitor select's options: monitors passing every field but Monitor
   * (legacy builds `$monitors_dropdown` after the other filters).
   */
  monitorOptions: Monitor[];
  /** Monitors passing every field. */
  filtered: Monitor[];
  /** Fields with a value — drives the "filtered" hint. */
  activeCount: number;
}

/**
 * @param monitors the page's live monitors.
 * @param runtimeById `/monitor-status` rows, when the page already polls
 *   them. Left out, the hook polls them itself, and only while a runtime
 *   status is picked.
 */
export function useMonitorFilterRow(
  monitors: Monitor[],
  runtimeById?: Record<number, MonitorRuntime>,
): MonitorFilterRowState {
  const { isAuthenticated } = useAuthStore();
  const store = useMonitorFilterStore();
  const row = useMonitorFilterRowStore();
  const { name, source, status, serverId, storageId } = row;

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
  const serversQ = useQuery({
    queryKey: ['servers'],
    queryFn: () => listServers({ page: 1, page_size: 200 }),
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
  });
  const storageQ = useQuery({
    queryKey: ['storage'],
    queryFn: () => getStorageList({ page: 1, page_size: 200 }),
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
  });
  const groups = useMemo(() => groupsQ.data?.items ?? [], [groupsQ.data]);
  const servers = serversQ.data?.items ?? [];
  const storages = storageQ.data?.items ?? [];
  const groupMonitors = groupMonitorsQ.data?.items;
  const groupOptions = useMemo(() => groupDropdownOptions(groups), [groups]);

  const statuses = splitValues(status);
  // Soft-deleted monitors are fetched only while the Status select holds
  // Deleted, so a page that never asks pays nothing. The page's own list
  // stays the live monitors; the deleted rows are appended here.
  const wantDeleted = statuses.includes(DELETED_STATUS);
  const deletedQ = useQuery({
    queryKey: ['monitors', 'all', { include_deleted: true }],
    queryFn: () => getAllMonitors({ include_deleted: true }),
    enabled: isAuthenticated && wantDeleted,
  });
  const deletedRows = deletedQ.data;
  // Rows cached from an earlier Deleted pick may linger once it is cleared;
  // `applyLocalFilters` drops them then, so the pool need not.
  const pool = useMemo(() => {
    if (!deletedRows) return monitors;
    const live = new Set(monitors.map((m) => m.id));
    return [...monitors, ...deletedRows.filter((m) => isDeleted(m) && !live.has(m.id))];
  }, [monitors, deletedRows]);

  const wantRuntime = statuses.some((s) => s !== DELETED_STATUS);
  const ownRuntime = useMonitorStatuses(runtimeById === undefined && wantRuntime).byId;
  const runtime = runtimeById ?? ownRuntime;

  const membership = useMemo(() => {
    const map = new Map<number, Set<number>>();
    for (const gm of groupMonitors ?? []) {
      if (!map.has(gm.group_id)) map.set(gm.group_id, new Set());
      map.get(gm.group_id)!.add(gm.monitor_id);
    }
    return map;
  }, [groupMonitors]);

  const values: FilterRowValues = {
    groupId: store.groupIds.join(','),
    capturing: store.capturing.join(','),
    analysing: store.analysing.join(','),
    recording: store.recording.join(','),
    monitorId: store.monitorIds.join(','),
    name, source, status, serverId, storageId,
  };
  const valuesMulti = Object.fromEntries(
    FILTER_ROW_FIELDS.map((f) => [f, splitValues(values[f])]),
  ) as Record<FilterRowField, string[]>;

  const monitorOptions = useMemo(() => {
    const viaStore = filterMonitors(pool, {
      groupIds: expandGroupIds(store.groupIds, groups),
      capturing: store.capturing,
      analysing: store.analysing,
      recording: store.recording,
      status: [],
      source: [],
      monitorIds: [],
    }, membership);
    return applyLocalFilters(viaStore, { name, source, status, serverId, storageId }, runtime);
  }, [pool, store.groupIds, groups, store.capturing, store.analysing, store.recording, membership,
    name, source, status, serverId, storageId, runtime]);

  // Legacy drops the Monitor selection when none of it survives the other
  // filters (`$found_selected_monitor`), rather than showing an empty list.
  const filtered = useMemo(() => {
    const picked = new Set(store.monitorIds);
    if (picked.size === 0) return monitorOptions;
    const hit = monitorOptions.filter((m) => picked.has(m.id));
    return hit.length ? hit : monitorOptions;
  }, [monitorOptions, store.monitorIds]);

  const set = (field: FilterRowField, value: string) => {
    const list = splitValues(value);
    switch (field) {
      case 'groupId': store.setGroupIds(list.map(Number).filter(Number.isFinite)); break;
      case 'capturing': store.setCapturing(list); break;
      case 'analysing': store.setAnalysing(list); break;
      case 'recording': store.setRecording(list); break;
      case 'monitorId': store.setMonitorIds(parseIdList(value)); break;
      default: row.setField(field, value);
    }
  };
  const setMulti = (field: FilterRowField, list: string[]) => set(field, list.join(','));

  const reset = () => {
    store.setGroupIds([]);
    store.setCapturing([]);
    store.setAnalysing([]);
    store.setRecording([]);
    store.setMonitorIds([]);
    row.reset();
  };

  return {
    groups,
    groupOptions,
    servers,
    storages,
    values,
    valuesMulti,
    set,
    setMulti,
    clear: (field) => set(field, ''),
    reset,
    monitorOptions,
    filtered,
    activeCount: FILTER_ROW_FIELDS.filter((f) => values[f] !== '').length,
  };
}

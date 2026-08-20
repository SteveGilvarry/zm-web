import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listGroups, listGroupMonitors, type Group } from '@/api/groups';
import { useAuthStore } from '@/stores/auth';
import { useMonitorFilterStore } from '@/stores/monitorFilter';
import type { Monitor } from '@/types';
import { filterMonitors } from './filterMonitors';
import type { MonitorRuntime } from './useMonitorStatuses';

/**
 * The legacy `_monitor_filters.php` row: eight fields, in this order.
 * Group / Capturing / Analysing / Recording / Monitor are shared with the
 * modern chip bar through `useMonitorFilterStore` (so `?group=` and a chip
 * picked on Console carry over); Name / Source are regexes and Status is the
 * *runtime* state (`/monitor-status`), which the chip bar does not model, so
 * those three live in this hook.
 */
export type FilterRowField =
  | 'groupId' | 'name' | 'capturing' | 'analysing' | 'recording' | 'status' | 'source' | 'monitorId';

export type FilterRowValues = Record<FilterRowField, string>;

export const FILTER_ROW_FIELDS: readonly FilterRowField[] = [
  'groupId', 'name', 'capturing', 'analysing', 'recording', 'status', 'source', 'monitorId',
];

/** Wire values of the legacy Status select; labels are translated in the component. */
export const RUNTIME_STATUS_OPTIONS = ['Unknown', 'NotRunning', 'Running', 'Connected'] as const;

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
  values: Pick<FilterRowValues, 'name' | 'source' | 'status'>,
  runtimeById: Record<number, MonitorRuntime>,
): Monitor[] {
  return monitors.filter((m) => {
    if (!matchesText(values.name, m.name)) return false;
    if (!matchesText(values.source, monitorSource(m))) return false;
    if (values.status) {
      const status = runtimeById[m.id]?.status ?? 'Unknown';
      if (status !== values.status) return false;
    }
    return true;
  });
}

export interface MonitorFilterRowState {
  groups: Group[];
  values: FilterRowValues;
  set: (field: FilterRowField, value: string) => void;
  clear: (field: FilterRowField) => void;
  reset: () => void;
  /** Monitors passing every field. */
  filtered: Monitor[];
  /** Fields with a value — drives the "filtered" hint. */
  activeCount: number;
}

const EMPTY_RUNTIME: Record<number, MonitorRuntime> = {};

export function useMonitorFilterRow(
  monitors: Monitor[],
  runtimeById: Record<number, MonitorRuntime> = EMPTY_RUNTIME,
): MonitorFilterRowState {
  const { isAuthenticated } = useAuthStore();
  const store = useMonitorFilterStore();
  const [local, setLocal] = useState({ name: '', source: '', status: '' });

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
  const groups = groupsQ.data?.items ?? [];
  const groupMonitors = groupMonitorsQ.data?.items;

  const membership = useMemo(() => {
    const map = new Map<number, Set<number>>();
    for (const gm of groupMonitors ?? []) {
      if (!map.has(gm.group_id)) map.set(gm.group_id, new Set());
      map.get(gm.group_id)!.add(gm.monitor_id);
    }
    return map;
  }, [groupMonitors]);

  const values: FilterRowValues = {
    groupId: store.groupIds[0] != null ? String(store.groupIds[0]) : '',
    capturing: store.capturing[0] ?? '',
    analysing: store.analysing[0] ?? '',
    recording: store.recording[0] ?? '',
    monitorId: store.monitorIds[0] != null ? String(store.monitorIds[0]) : '',
    name: local.name,
    source: local.source,
    status: local.status,
  };

  const filtered = useMemo(() => {
    const viaStore = filterMonitors(monitors, {
      groupIds: store.groupIds,
      capturing: store.capturing,
      analysing: store.analysing,
      recording: store.recording,
      status: [],
      source: [],
      monitorIds: store.monitorIds,
    }, membership);
    return applyLocalFilters(viaStore, local, runtimeById);
  }, [monitors, store.groupIds, store.capturing, store.analysing, store.recording, store.monitorIds, membership, local, runtimeById]);

  const set = (field: FilterRowField, value: string) => {
    const list = value ? [value] : [];
    switch (field) {
      case 'groupId': store.setGroupIds(list.map(Number)); break;
      case 'capturing': store.setCapturing(list); break;
      case 'analysing': store.setAnalysing(list); break;
      case 'recording': store.setRecording(list); break;
      case 'monitorId': store.setMonitorIds(list.map(Number)); break;
      default: setLocal((s) => ({ ...s, [field]: value }));
    }
  };

  const reset = () => {
    store.setGroupIds([]);
    store.setCapturing([]);
    store.setAnalysing([]);
    store.setRecording([]);
    store.setMonitorIds([]);
    setLocal({ name: '', source: '', status: '' });
  };

  return {
    groups,
    values,
    set,
    clear: (field) => set(field, ''),
    reset,
    filtered,
    activeCount: FILTER_ROW_FIELDS.filter((f) => values[f] !== '').length,
  };
}

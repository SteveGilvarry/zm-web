import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { deleteZone, listZonesForMonitor, type Zone } from '@/api/zones';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/components/common/toastStore';
import { useMonitorStatus, type MonitorRuntime } from '@/features/monitors/useMonitorStatuses';
import { useRouteSearch } from '@/features/monitors/useRouteSearch';
import { useZonesPage, type ZonesPageState } from './useZonesPage';
import { zoneArea } from './zoneArea';
import { parseZoneParam } from './zoneParam';

export interface ZonesListPageState extends ZonesPageState {
  /** Largest first, as legacy lists them (`zones.php:65`). */
  zones: Zone[];
  zonesLoading: boolean;
  zonesError: boolean;
  error: unknown;
  refetch: () => void;
  /** The monitor's capture state and fps, for legacy's status line. */
  runtime: MonitorRuntime | undefined;
  /** Legacy "Mark" checkboxes. */
  marked: Set<number>;
  toggleMark: (id: number) => void;
  toggleMarkAll: () => void;
  /** Confirms, then deletes every marked zone. */
  deleteMarked: () => void;
  busy: boolean;
  /** Zone open in the editor (`?zid=`); `'new'` for Add New Zone. */
  editing: number | 'new' | null;
  openEditor: (id: number | 'new') => void;
  closeEditor: () => void;
}

/**
 * Legacy `?view=zones&mid=` and `?view=zone&mid=&zid=`: the zone table and
 * picture for one monitor, and which zone the editor has open.
 *
 * The open zone lives in the URL as `?zid=`, so a link, a reload and the
 * browser's Back all land where legacy's separate zone page would. It is
 * mirrored in state too, so the page still works where no router is
 * listening.
 */
export function useZonesListPage(monitorId: number): ZonesListPageState {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const base = useZonesPage(monitorId);
  const runtime = useMonitorStatus(monitorId, isAuthenticated && !!monitorId);
  const [marked, setMarked] = useState<Set<number>>(new Set());

  const urlZid = parseZoneParam(useRouteSearch().zid);
  const [editing, setEditing] = useState<number | 'new' | null>(urlZid);
  // Back / Forward change the URL under us: follow it.
  const [seenZid, setSeenZid] = useState(urlZid);
  if (urlZid !== seenZid) {
    setSeenZid(urlZid);
    setEditing(urlZid);
  }

  const setZid = (id: number | 'new' | null) => {
    setEditing(id);
    void navigate({
      to: '.',
      search: (prev: Record<string, unknown>) => {
        const next = { ...prev };
        if (id == null) delete next.zid; else next.zid = id;
        return next;
      },
    });
  };

  const zonesQ = useQuery({
    queryKey: ['zones', monitorId],
    queryFn: () => listZonesForMonitor(monitorId, { page: 1, page_size: 100 }),
    enabled: isAuthenticated && !!monitorId,
  });
  const view = base.view;
  const items = zonesQ.data?.items;
  const zones = useMemo(() => {
    const list = items ?? [];
    if (!view) return list;
    // Measured from the polygon: the stored Area goes stale whenever
    // anything but legacy's editor writes Coords (zm-api#43).
    return [...list].sort((a, b) => zoneArea(b, view).px - zoneArea(a, view).px);
  }, [items, view]);

  const deleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const results = await Promise.allSettled(ids.map((id) => deleteZone(id)));
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (failed.length) throw failed[0].reason;
      return ids.length;
    },
    onSuccess: (n) => {
      setMarked(new Set());
      toast.success(t('{{count}} zone deleted', { count: n }));
    },
    onError: toast.apiError,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['zones', monitorId] });
      qc.invalidateQueries({ queryKey: ['monitor', monitorId] });
      qc.invalidateQueries({ queryKey: ['monitors'] });
    },
  });

  const deleteMarked = () => {
    const ids = [...marked];
    if (ids.length === 0) return;
    if (window.confirm(t('Delete {{count}} zone?', { count: ids.length }))) deleteMutation.mutate(ids);
  };

  return {
    ...base,
    zones,
    zonesLoading: zonesQ.isLoading,
    zonesError: zonesQ.isError,
    error: zonesQ.error,
    refetch: () => { void zonesQ.refetch(); },
    runtime,
    marked,
    toggleMark: (id) =>
      setMarked((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      }),
    toggleMarkAll: () =>
      setMarked((prev) => (prev.size === zones.length ? new Set() : new Set(zones.map((z) => z.id)))),
    deleteMarked,
    busy: deleteMutation.isPending,
    editing,
    openEditor: (id) => setZid(id),
    closeEditor: () => setZid(null),
  };
}

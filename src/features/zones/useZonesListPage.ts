import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { deleteZone, listZonesForMonitor, type Zone } from '@/api/zones';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/components/common/toastStore';
import { useZonesPage, type ZonesPageState } from './useZonesPage';

export interface ZonesListPageState extends ZonesPageState {
  zones: Zone[];
  zonesLoading: boolean;
  zonesError: boolean;
  error: unknown;
  refetch: () => void;
  /** Legacy "Mark" checkboxes. */
  marked: Set<number>;
  toggleMark: (id: number) => void;
  toggleMarkAll: () => void;
  /** Confirms, then deletes every marked zone. */
  deleteMarked: () => void;
  busy: boolean;
  /** Zone being edited in place; `'new'` for Add New Zone. */
  editing: number | 'new' | null;
  openEditor: (id: number | 'new') => void;
  closeEditor: () => void;
}

/** Legacy `?view=zones&mid=`: the zone table + picture for one monitor. */
export function useZonesListPage(monitorId: number): ZonesListPageState {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const toast = useToast();
  const qc = useQueryClient();
  const base = useZonesPage(monitorId);
  const [marked, setMarked] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<number | 'new' | null>(null);

  const zonesQ = useQuery({
    queryKey: ['zones', monitorId],
    queryFn: () => listZonesForMonitor(monitorId, { page: 1, page_size: 100 }),
    enabled: isAuthenticated && !!monitorId,
  });
  const zones = zonesQ.data?.items ?? [];

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
    openEditor: (id) => setEditing(id),
    closeEditor: () => setEditing(null),
  };
}

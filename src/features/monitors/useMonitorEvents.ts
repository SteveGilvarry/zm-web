import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { deleteEvent, getEvents, type EventSortField, type SortDirection } from '@/api/events';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/components/common/toastStore';
import { useZmConfig } from '@/features/config/useZmConfig';
import type { ZmEvent } from '@/types';

export interface MonitorEventsState {
  events: ZmEvent[];
  total: number;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
  page: number;
  setPage: (p: number) => void;
  pageSize: number;
  setPageSize: (n: number) => void;
  sortField: EventSortField;
  sortDir: SortDirection;
  toggleSort: (field: EventSortField) => void;
  selectedIds: Set<number>;
  toggleSelected: (id: number) => void;
  clearSelection: () => void;
  /** Confirms, then deletes every selected event. */
  deleteSelected: () => void;
  busy: boolean;
  showThumbs: boolean;
  thumbWidth: number;
  accessToken: string | null;
}

/**
 * The legacy watch page's bottom table: every event for one monitor,
 * server-paged and sorted, with a Delete checkbox column. Page size and
 * thumbnails follow the same `ZM_WEB_*` rows as the Events page.
 */
export function useMonitorEvents(monitorId: number, enabled = true): MonitorEventsState {
  const { t } = useTranslation();
  const { isAuthenticated, accessToken } = useAuthStore();
  const toast = useToast();
  const qc = useQueryClient();
  const configPageSize = useZmConfig('ZM_WEB_EVENTS_PER_PAGE', 25);
  const showThumbs = useZmConfig('ZM_WEB_LIST_THUMBS', true);
  const thumbWidth = useZmConfig('ZM_WEB_LIST_THUMB_WIDTH', 48);

  const [page, setPageState] = useState(1);
  const [pageSizeOverride, setPageSizeOverride] = useState<number | null>(null);
  const pageSize = pageSizeOverride ?? configPageSize;
  const [sortField, setSortField] = useState<EventSortField>('start_time');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const q = useQuery({
    queryKey: ['monitorEvents', monitorId, page, pageSize, sortField, sortDir],
    queryFn: () => getEvents({
      monitor_id: monitorId,
      page,
      page_size: pageSize > 0 ? pageSize : 500,
      sort: sortField,
      direction: sortDir,
    }),
    enabled: isAuthenticated && enabled && Number.isFinite(monitorId),
    refetchInterval: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const results = await Promise.allSettled(ids.map((id) => deleteEvent(id)));
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (failed.length) throw failed[0].reason;
      return ids.length;
    },
    onSuccess: (n) => {
      setSelectedIds(new Set());
      toast.success(t('{{count}} event deleted', { count: n }));
    },
    onError: toast.apiError,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['monitorEvents', monitorId] });
      qc.invalidateQueries({ queryKey: ['events'] });
      qc.invalidateQueries({ queryKey: ['eventSummaries'] });
    },
  });

  const toggleSort = (field: EventSortField) => {
    if (field === sortField) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('asc'); }
    setPageState(1);
  };

  const deleteSelected = () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (window.confirm(t('Delete {{count}} event? This cannot be undone.', { count: ids.length }))) {
      deleteMutation.mutate(ids);
    }
  };

  return {
    events: q.data?.items ?? [],
    total: q.data?.total ?? 0,
    isLoading: q.isLoading,
    isError: q.isError,
    error: q.error,
    refetch: () => { void q.refetch(); },
    page,
    setPage: (p) => setPageState(Math.max(1, p)),
    pageSize,
    setPageSize: (n) => { setPageSizeOverride(n); setPageState(1); },
    sortField,
    sortDir,
    toggleSort,
    selectedIds,
    toggleSelected: (id) =>
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      }),
    clearSelection: () => setSelectedIds(new Set()),
    deleteSelected,
    busy: deleteMutation.isPending,
    showThumbs,
    thumbWidth,
    accessToken,
  };
}

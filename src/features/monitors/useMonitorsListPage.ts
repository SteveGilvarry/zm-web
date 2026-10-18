import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getMonitors, getLiveSessions } from '@/api/monitors';
import { cloneMonitor, deleteMonitor } from '@/api/monitors-crud';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/components/common/toastStore';
import { useMonitorStatuses, type MonitorRuntime } from './useMonitorStatuses';
import { useRouteSearch, searchFlag } from './useRouteSearch';
import { newMonitorSeed } from './editor/newMonitor';
import type { MonitorEditorSeed } from './editor/useMonitorEditor';
import type { Monitor } from '@/types';

export type MonitorsViewMode = 'grid' | 'list';
export type MonitorsStatusFilter = 'all' | 'active' | 'inactive' | 'streaming';

export const MONITORS_STATUS_FILTERS: readonly MonitorsStatusFilter[] = [
  'all', 'active', 'inactive', 'streaming',
];
export const MONITORS_PAGE_SIZE = 24;

export interface MonitorsListPageState {
  isAuthenticated: boolean;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  /** Monitors on the current page, unfiltered. */
  monitors: Monitor[];
  /** Monitors on the current page that pass the search + status filters. */
  filteredMonitors: Monitor[];
  /** Server-side total across all pages (undefined until loaded). */
  total: number | undefined;
  totalPages: number;
  page: number;
  setPage: Dispatch<SetStateAction<number>>;
  liveSessions: number[];
  liveSessionIds: Set<number>;
  /** Capture-process state per monitor (`/monitor-status`, 5 s poll). */
  runtimeById: Record<number, MonitorRuntime>;
  viewMode: MonitorsViewMode;
  setViewMode: (mode: MonitorsViewMode) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  statusFilter: MonitorsStatusFilter;
  setStatusFilter: (f: MonitorsStatusFilter) => void;
  /** What the Add editor starts from; null while it is closed. */
  addSeed: MonitorEditorSeed | null;
  /** Opens the full editor on a new monitor (`Monitor-N`, the box's defaults). */
  openAdd: () => void;
  closeAdd: () => void;
  refetch: () => void;
  clone: (id: number) => void;
  /** Confirms with the operator, then deletes. */
  requestDelete: (id: number, name: string) => void;
  /** A clone or delete is in flight. */
  busy: boolean;
}

/**
 * Data + filter state for the Monitors list. Both skins render from this;
 * only the presentation of the filtered rows differs.
 */
export function useMonitorsListPage(): MonitorsListPageState {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const qc = useQueryClient();
  const toast = useToast();
  const search = useRouteSearch();
  const [viewMode, setViewMode] = useState<MonitorsViewMode>('grid');
  // Add seeds from every monitor, not just this page: the new name takes
  // the next id and must not collide.
  const [addSeed, setAddSeed] = useState<MonitorEditorSeed | null>(null);
  const addMutation = useMutation({
    mutationFn: async () =>
      newMonitorSeed((await getMonitors({ page: 1, page_size: 1000 })).items, {}, { prefix: t('Monitor') }),
    onSuccess: setAddSeed,
    onError: toast.apiError,
  });
  // `?new=true` (legacy `?view=monitor` with no id) opens Add on load.
  const [openOnLoad] = useState(() => searchFlag(search, 'new'));
  const { mutate: startAdd } = addMutation;
  useEffect(() => {
    if (openOnLoad && isAuthenticated) startAdd();
  }, [openOnLoad, isAuthenticated, startAdd]);

  const cloneMutation = useMutation({
    mutationFn: (id: number) => cloneMonitor(id),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['monitors'] });
      toast.success(t('Cloned as "{{name}}"', { name: created.name }));
    },
    onError: toast.apiError,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteMonitor(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['monitors'] });
      toast.success(t('Monitor deleted'));
    },
    onError: toast.apiError,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<MonitorsStatusFilter>('all');
  const [page, setPage] = useState(1);
  const pageSize = MONITORS_PAGE_SIZE;

  const { data: monitorsData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['monitors', page, pageSize],
    queryFn: () => getMonitors({ page, page_size: pageSize }),
    enabled: isAuthenticated,
    refetchInterval: 30000,
  });

  const { data: liveSessions = [] } = useQuery({
    queryKey: ['liveSessions'],
    queryFn: getLiveSessions,
    enabled: isAuthenticated,
    refetchInterval: 10000,
  });

  const { byId: runtimeById } = useMonitorStatuses();

  const monitors = useMemo(() => monitorsData?.items || [], [monitorsData?.items]);
  const totalPages = monitorsData?.last_page || 1;

  const filteredMonitors = useMemo(() => {
    return monitors.filter((monitor) => {
      // Search filter
      if (searchQuery && !monitor.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }

      // Status filter
      if (statusFilter === 'active' && monitor.capturing === 'None') {
        return false;
      }
      if (statusFilter === 'inactive' && monitor.capturing !== 'None') {
        return false;
      }
      if (statusFilter === 'streaming' && !liveSessions.includes(monitor.id)) {
        return false;
      }

      return true;
    });
  }, [monitors, searchQuery, statusFilter, liveSessions]);

  const requestDelete = (id: number, name: string) => {
    if (confirm(t('Delete monitor "{{name}}"? This removes its config and any future captures; existing event recordings are kept until storage is reclaimed.', { name }))) {
      deleteMutation.mutate(id);
    }
  };

  return {
    isAuthenticated,
    isLoading,
    isError,
    error,
    monitors,
    filteredMonitors,
    total: monitorsData?.total,
    totalPages,
    page,
    setPage,
    liveSessions,
    liveSessionIds: new Set(liveSessions),
    runtimeById,
    viewMode,
    setViewMode,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    addSeed,
    openAdd: () => addMutation.mutate(),
    closeAdd: () => setAddSeed(null),
    refetch: () => { void refetch(); },
    clone: (id) => cloneMutation.mutate(id),
    requestDelete,
    busy: cloneMutation.isPending || deleteMutation.isPending,
  };
}

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { updateMonitor } from '@/api/monitors';
import { cloneMonitor, deleteMonitor } from '@/api/monitors-crud';
import { listManufacturers } from '@/api/manufacturers';
import { listModels } from '@/api/models';
import { listServers } from '@/api/servers';
import { getStorageList } from '@/api/storage';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/components/common/toastStore';
import { usePerms } from '@/features/auth/usePerms';
import { useZmConfig } from '@/features/config/useZmConfig';
import { useMonitorFilterRow, type MonitorFilterRowState } from '@/features/monitors/useMonitorFilterRow';
import { useRouteSearch, searchFlag } from '@/features/monitors/useRouteSearch';
import { summarizeRuntime, type RuntimeTotals } from '@/features/monitors/useMonitorStatuses';
import type { Monitor } from '@/types';
import { useConsoleData, lookupSummary, type ConsoleData } from './useConsoleData';
import { useConsoleColumnsStore, type ConsoleColumnKey } from './consoleColumns';
import {
  downloadText,
  exportColumns,
  pageSlice,
  rowsToCsv,
  rowsToJson,
  searchRows,
  sortRows,
  totalsFor,
  type ConsoleRow,
  type ConsoleSortKey,
  type ConsoleTotals,
  type SortContext,
  type SortDir,
} from './consoleTable';

/** Legacy bulk "Select" dialog: the three mode columns, blank = leave as is. */
export interface BulkModeUpdate {
  capturing?: string;
  analysing?: string;
  recording?: string;
}

export interface ClassicConsolePageState {
  isAuthenticated: boolean;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  data: ConsoleData;
  filter: MonitorFilterRowState;
  /** Rows after filter + search + sort (every page). */
  allRows: ConsoleRow[];
  /** The current page. */
  rows: ConsoleRow[];
  total: number;
  totals: ConsoleTotals;
  runtimeTotals: RuntimeTotals;
  hasRuntime: boolean;
  /** Names for the id columns (empty string when unknown). */
  names: Required<SortContext>;

  search: string;
  setSearch: (q: string) => void;
  sortKey: ConsoleSortKey;
  sortDir: SortDir;
  toggleSort: (key: ConsoleSortKey) => void;
  resetSort: () => void;
  /** Legacy SORT button: drag rows to renumber `sequence`. */
  sortMode: boolean;
  toggleSortMode: () => void;
  reorder: (orderedIds: number[]) => void;

  page: number;
  setPage: (p: number) => void;
  pageSize: number;
  setPageSize: (n: number) => void;

  selectedIds: Set<number>;
  toggleSelected: (id: number) => void;
  toggleAllOnPage: () => void;
  clearSelection: () => void;

  columns: { isVisible: (k: ConsoleColumnKey) => boolean; toggle: (k: ConsoleColumnKey) => void; reset: () => void };
  /** Config / data gated columns. */
  showThumbs: boolean;
  showId: boolean;
  showServer: boolean;
  showStorage: boolean;
  canEdit: boolean;

  addOpen: boolean;
  openAdd: () => void;
  closeAdd: () => void;
  cloneSelected: () => void;
  editSelected: () => void;
  deleteSelected: () => void;
  bulkOpen: boolean;
  openBulk: () => void;
  closeBulk: () => void;
  applyBulk: (update: BulkModeUpdate) => void;
  busy: boolean;
  refresh: () => void;
  exportRows: (format: 'csv' | 'json') => void;
}

/** Legacy `zm_Config` default for the console page size (`ZM_WEB_EVENTS_PER_PAGE`). */
const DEFAULT_PAGE_SIZE = 25;

/**
 * Everything the legacy console table does: filter row, search, sort,
 * paging, checkbox selection, the ADD / CLONE / EDIT / DELETE / SELECT /
 * SORT verbs, column visibility and export. Composes `useConsoleData` so the
 * numbers match the modern Console.
 */
export function useClassicConsolePage(): ClassicConsolePageState {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const { can } = usePerms();
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const search = useRouteSearch();
  const data = useConsoleData();
  const filter = useMonitorFilterRow(data.monitors, data.runtimeById);
  const columnsStore = useConsoleColumnsStore();

  const showThumbs = useZmConfig('ZM_WEB_LIST_THUMBS', true);
  const showId = useZmConfig('ZM_WEB_ID_ON_CONSOLE', true);
  const configPageSize = useZmConfig('ZM_WEB_EVENTS_PER_PAGE', DEFAULT_PAGE_SIZE);

  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<ConsoleSortKey>('sequence');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [sortMode, setSortMode] = useState(false);
  const [page, setPageState] = useState(1);
  const [pageSizeOverride, setPageSizeOverride] = useState<number | null>(null);
  const pageSize = pageSizeOverride ?? configPageSize;
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  // `?new=true` (legacy `?view=monitor` with no id) opens the Add dialog on load.
  const [addOpen, setAddOpen] = useState(() => searchFlag(search, 'new'));
  const [bulkOpen, setBulkOpen] = useState(false);

  /* ----- Lookup tables for the id columns ------------------------------- */
  const manufacturersQ = useQuery({
    queryKey: ['manufacturers'],
    queryFn: () => listManufacturers({ page: 1, page_size: 500 }),
    enabled: isAuthenticated && columnsStore.isVisible('manufacturer'),
    staleTime: 5 * 60_000,
  });
  const modelsQ = useQuery({
    queryKey: ['models'],
    queryFn: () => listModels({ page: 1, page_size: 500 }),
    enabled: isAuthenticated && columnsStore.isVisible('model'),
    staleTime: 5 * 60_000,
  });
  const serversQ = useQuery({
    queryKey: ['servers'],
    queryFn: () => listServers({ page: 1, page_size: 100 }),
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
  });
  const storageQ = useQuery({
    queryKey: ['storage'],
    queryFn: () => getStorageList({ page: 1, page_size: 100 }),
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
  });
  const nameOf = (items: Array<{ id: number; name: string }> | undefined) =>
    (id: number | null | undefined) => (id == null ? '' : items?.find((x) => x.id === id)?.name ?? '');
  const names: Required<SortContext> = {
    manufacturerName: nameOf(manufacturersQ.data?.items),
    modelName: nameOf(modelsQ.data?.items),
    serverName: nameOf(serversQ.data?.items),
    storageName: nameOf(storageQ.data?.items),
  };
  const serverCount = serversQ.data?.items.length ?? 0;
  const storageCount = storageQ.data?.items.length ?? 0;

  /* ----- Rows ------------------------------------------------------------ */
  const allRows = useMemo(() => {
    const rows: ConsoleRow[] = filter.filtered.map((m) => ({
      monitor: m,
      summary: lookupSummary(data.summariesByMonitor, m.id),
      runtime: data.runtimeById[m.id],
    }));
    return sortRows(searchRows(rows, query), sortKey, sortDir, names);
    // `names` closes over query results that are already deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.filtered, data.summariesByMonitor, data.runtimeById, query, sortKey, sortDir,
    manufacturersQ.data, modelsQ.data, serversQ.data, storageQ.data]);

  const total = allRows.length;
  const rows = pageSlice(allRows, page, pageSize);
  const totals = useMemo(() => totalsFor(allRows), [allRows]);
  const runtimeTotals = useMemo(
    () => summarizeRuntime(data.runtimeById, allRows.map((r) => r.monitor.id)),
    [data.runtimeById, allRows],
  );
  const hasRuntime = allRows.some((r) => r.runtime != null);

  const setPage = (p: number) => setPageState(Math.max(1, p));
  const setPageSize = (n: number) => { setPageSizeOverride(n); setPageState(1); };
  const setSearch = (q: string) => { setQuery(q); setPageState(1); };

  const toggleSort = (key: ConsoleSortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };
  const resetSort = () => { setSortKey('sequence'); setSortDir('asc'); };
  const toggleSortMode = () => {
    // Dragging only makes sense over the sequence order.
    if (!sortMode) resetSort();
    setSortMode((v) => !v);
  };

  /* ----- Selection ------------------------------------------------------- */
  const toggleSelected = (id: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  const toggleAllOnPage = () =>
    setSelectedIds((prev) => {
      const ids = rows.map((r) => r.monitor.id);
      const all = ids.every((id) => prev.has(id));
      const next = new Set(prev);
      ids.forEach((id) => (all ? next.delete(id) : next.add(id)));
      return next;
    });
  const clearSelection = () => setSelectedIds(new Set());
  const firstSelected = () => allRows.find((r) => selectedIds.has(r.monitor.id))?.monitor;

  /* ----- Mutations ------------------------------------------------------- */
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['monitors'] });
    qc.invalidateQueries({ queryKey: ['eventSummaries'] });
  };
  const cloneMutation = useMutation({
    mutationFn: (m: Monitor) => cloneMonitor(m.id),
    onSuccess: (created) => { invalidate(); toast.success(t('Cloned as "{{name}}"', { name: created.name })); },
    onError: toast.apiError,
  });
  const deleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const results = await Promise.allSettled(ids.map((id) => deleteMonitor(id)));
      const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
      if (failed.length) throw failed[0].reason;
      return ids.length;
    },
    onSuccess: (n) => { invalidate(); clearSelection(); toast.success(t('{{count}} monitor deleted', { count: n })); },
    onError: (err) => { invalidate(); toast.apiError(err); },
  });
  const bulkMutation = useMutation({
    mutationFn: async ({ ids, update }: { ids: number[]; update: BulkModeUpdate }) => {
      const patch = Object.fromEntries(Object.entries(update).filter(([, v]) => v)) as Partial<Monitor>;
      const results = await Promise.allSettled(ids.map((id) => updateMonitor(id, patch)));
      const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
      if (failed.length) throw failed[0].reason;
      return ids.length;
    },
    onSuccess: (n) => { invalidate(); setBulkOpen(false); toast.success(t('{{count}} monitor updated', { count: n })); },
    onError: (err) => { invalidate(); toast.apiError(err); },
  });
  const reorderMutation = useMutation({
    mutationFn: async (orderedIds: number[]) => {
      const current = new Map(data.monitors.map((m) => [m.id, m.sequence ?? null]));
      const changes = orderedIds
        .map((id, i) => ({ id, seq: i + 1 }))
        .filter((c) => current.get(c.id) !== c.seq);
      await Promise.all(changes.map((c) => updateMonitor(c.id, { sequence: c.seq } as Partial<Monitor>)));
    },
    onSettled: invalidate,
    onError: toast.apiError,
  });

  const cloneSelected = () => { const m = firstSelected(); if (m) cloneMutation.mutate(m); };
  const editSelected = () => {
    const m = firstSelected();
    if (m) void navigate({ to: '/monitors/$monitorId', params: { monitorId: String(m.id) }, search: { edit: true } });
  };
  const deleteSelected = () => {
    const ids = allRows.filter((r) => selectedIds.has(r.monitor.id)).map((r) => r.monitor.id);
    if (ids.length === 0) return;
    if (window.confirm(t('Delete {{count}} monitor? Recorded events are kept until storage reclaims them.', { count: ids.length }))) {
      deleteMutation.mutate(ids);
    }
  };
  const applyBulk = (update: BulkModeUpdate) => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    bulkMutation.mutate({ ids, update });
  };

  const refresh = () => {
    invalidate();
    qc.invalidateQueries({ queryKey: ['monitorStatuses'] });
  };

  const exportRows = (format: 'csv' | 'json') => {
    const cols = exportColumns(names);
    if (format === 'csv') downloadText('console.csv', rowsToCsv(allRows, cols), 'text/csv;charset=utf-8');
    else downloadText('console.json', rowsToJson(allRows, cols), 'application/json');
  };

  return {
    isAuthenticated,
    isLoading: data.loading.monitors,
    isError: data.isError,
    error: data.error,
    data,
    filter,
    allRows,
    rows,
    total,
    totals,
    runtimeTotals,
    hasRuntime,
    names,
    search: query,
    setSearch,
    sortKey,
    sortDir,
    toggleSort,
    resetSort,
    sortMode,
    toggleSortMode,
    reorder: (ids) => reorderMutation.mutate(ids),
    page,
    setPage,
    pageSize,
    setPageSize,
    selectedIds,
    toggleSelected,
    toggleAllOnPage,
    clearSelection,
    columns: { isVisible: columnsStore.isVisible, toggle: columnsStore.toggle, reset: columnsStore.reset },
    showThumbs,
    showId,
    showServer: serverCount > 0,
    showStorage: storageCount > 1 && can('system', 'Edit'),
    canEdit: can('monitors', 'Edit'),
    addOpen,
    openAdd: () => setAddOpen(true),
    closeAdd: () => setAddOpen(false),
    cloneSelected,
    editSelected,
    deleteSelected,
    bulkOpen,
    openBulk: () => setBulkOpen(true),
    closeBulk: () => setBulkOpen(false),
    applyBulk,
    busy: cloneMutation.isPending || deleteMutation.isPending || bulkMutation.isPending || reorderMutation.isPending,
    refresh,
    exportRows,
  };
}

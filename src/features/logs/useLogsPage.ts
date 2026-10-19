import { useMirroredState } from '@/hooks/useMirroredState';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useAuthStore } from '@/stores/auth';
import {
  clearLogs, listLogComponents, listLogs,
  type LogEntry, type LogMinLevel, type LogSort, type LogSortField,
} from '@/api/logs';
import { listServers } from '@/api/servers';
import { useDateTimeFormat } from '@/features/config/useDateTimeFormat';
import { useZmConfig } from '@/features/config/useZmConfig';
import { downloadCsv, logsToCsv, type LogColumnKey } from './csv';
import { dateInputToUnix, parseLogTime, summarizeLogs } from './filter';
import { ALL_LOG_COLUMNS, DEFAULT_VISIBLE_LOG_COLUMNS } from './columns';
import { levelCodesParam, levelCodesToApi, parseLevelCodes, type LogLevelCode } from './levels';

/** URL search params for `/logs/`; the route's `validateSearch` produces this. */
export interface LogsSearchParams {
  component?: string;
  /** Severity threshold ("this level or worse"), the API's `min_level`. */
  min_level?: LogMinLevel;
  /**
   * Exact levels, legacy's multi-select: a comma list of codes (`ERR,WAR`,
   * see `levels.ts`). Sent to the API as numbers.
   */
  level?: string;
  server_id?: number;
  q?: string;
  start?: string;
  end?: string;
  sort?: LogSort;
  /** Column the list is ordered by; absent means `time`. */
  sort_by?: LogSortField;
  page?: number;
}

/**
 * Severity chips, wired straight to the API's `min_level`: each one means
 * "this level **or worse**", which is what the legacy dropdown always meant.
 * There is no separate PANIC chip because the enum has none — `fatal`
 * already returns PANIC (-4) and below. The label is the ZM code; the page
 * translates it.
 */
export const LEVEL_CHIPS: ReadonlyArray<{ value: LogMinLevel | undefined; code: string }> = [
  { value: undefined,  code: 'ALL' },
  { value: 'fatal',    code: 'FAT' },
  { value: 'error',    code: 'ERR' },
  { value: 'warning',  code: 'WAR' },
  { value: 'info',     code: 'INF' },
  { value: 'debug',    code: 'DBG' },
];

/** Legacy `data-page-list` on the log table (`log.php:140`). */
export const LOGS_PAGE_SIZE_OPTIONS: readonly number[] = [10, 25, 50, 100, 200, 300, 400, 500];

/** Legacy's `$defaultPageSize` fallback (`log.php:27`). */
export const LOGS_DEFAULT_PAGE_SIZE = 25;

/**
 * Pause after the last keystroke before the message search reaches the API.
 * Legacy's bootstrap-table search filters as you type; this is the same
 * behaviour without a request per character.
 */
export const LOGS_SEARCH_DEBOUNCE_MS = 350;

const COLUMN_PREF_KEY = 'zm-web.logs.columns';
const PAGE_SIZE_PREF_KEY = 'zm-web.logs.pageSize';

/**
 * Legacy `logPanelPageSize()` (`includes/logpanel.php:37-48`): as many
 * ~27 px rows as fit under the navbar, summary, toolbar, header and pager,
 * clamped to 10..100. Without a height it is 25.
 */
export function fittedLogsPageSize(innerHeight: number | undefined): number {
  if (!innerHeight) return LOGS_DEFAULT_PAGE_SIZE;
  return Math.max(10, Math.min(100, Math.floor((innerHeight - 56 - 18 - 66 - 25 - 58) / 27)));
}

/** A remembered pick wins (legacy's table cookie); else the window decides. */
function loadPageSizePref(): number {
  if (typeof window === 'undefined') return LOGS_DEFAULT_PAGE_SIZE;
  let n = NaN;
  try { n = Number(window.localStorage.getItem(PAGE_SIZE_PREF_KEY)); } catch { /* blocked storage */ }
  return LOGS_PAGE_SIZE_OPTIONS.includes(n) ? n : fittedLogsPageSize(window.innerHeight);
}

/** The page list, plus the fitted size when it is not on it, so the picker can show it. */
function pageSizeOptionsFor(pageSize: number): readonly number[] {
  return LOGS_PAGE_SIZE_OPTIONS.includes(pageSize)
    ? LOGS_PAGE_SIZE_OPTIONS
    : [...LOGS_PAGE_SIZE_OPTIONS, pageSize].sort((a, b) => a - b);
}

function loadColumnPrefs(): LogColumnKey[] {
  if (typeof window === 'undefined') return DEFAULT_VISIBLE_LOG_COLUMNS;
  try {
    const raw = window.localStorage.getItem(COLUMN_PREF_KEY);
    if (!raw) return DEFAULT_VISIBLE_LOG_COLUMNS;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_VISIBLE_LOG_COLUMNS;
    const filtered = parsed.filter(
      (c): c is LogColumnKey => typeof c === 'string' && (ALL_LOG_COLUMNS as string[]).includes(c),
    );
    return filtered.length ? filtered : DEFAULT_VISIBLE_LOG_COLUMNS;
  } catch {
    return DEFAULT_VISIBLE_LOG_COLUMNS;
  }
}

/**
 * Render a `time_key` (epoch seconds or ISO) through ZoneMinder's own
 * date/time settings and server zone. A hook, not a helper, because the
 * patterns come from the API.
 */
export function useLogTimeFormat(): (timeKey: string) => string {
  const { formatDateTime } = useDateTimeFormat();
  return (timeKey) => {
    const ms = parseLogTime(timeKey);
    return Number.isNaN(ms) ? timeKey : formatDateTime(new Date(ms));
  };
}

export interface LogsPageState {
  isAuthenticated: boolean;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;

  /** This page of rows, as the server filtered and ordered them. */
  logs: LogEntry[];
  total: number;
  /** Every row in the table, filters aside — legacy's "Available". Null until the API answers it. */
  totalUnfiltered: number | null;
  /** Severity counts over the rows on screen (see `summarizeLogs`). */
  summary: ReturnType<typeof summarizeLogs>;
  page: number;
  pageSize: number;
  pageSizeOptions: readonly number[];
  setPageSize: (n: number) => void;
  totalPages: number;

  componentFilter: string;
  /** Severity threshold; every filter here is server-side. */
  minLevel: LogMinLevel | undefined;
  /** Set the threshold; drops any exact-level pick, the two don't combine. */
  setMinLevel: (v: LogMinLevel | undefined) => void;
  /** Exact levels (legacy's multi-select); empty = All. */
  levels: LogLevelCode[];
  /** Set the exact levels; drops any threshold. */
  setLevels: (codes: LogLevelCode[]) => void;
  serverFilter: number | undefined;
  startInput: string;
  endInput: string;
  messageQuery: string;
  /** Order on `sortBy`: `desc` (newest first) unless a header flips it. */
  sort: LogSort;
  /** Column the server orders by; `time` by default. */
  sortBy: LogSortField;
  /**
   * Header click: the same column flips direction, a new column starts
   * ascending (bootstrap-table's default `sortOrder`). No argument = time.
   */
  toggleSort: (field?: LogSortField) => void;
  /** Local mirror of the search box; committed to the URL after a pause, or at once on Enter/blur. */
  searchDraft: string;
  setSearchDraft: (v: string) => void;
  commitSearchDraft: () => void;
  /** Patch the URL search params (empty values are dropped). */
  setSearch: (patch: Partial<LogsSearchParams>) => void;

  allComponents: string[];
  servers: Array<{ id: number; name: string }>;
  showServerFilter: boolean;
  serverLookup: Record<number, string>;

  showColumns: boolean;
  toggleColumns: () => void;
  closeColumns: () => void;
  visibleColumns: LogColumnKey[];
  setVisibleColumns: (cols: LogColumnKey[]) => void;

  exportCsv: () => void;

  /** Silent background refresh, legacy's `autoRefresh` toolbar toggle. */
  autoRefresh: boolean;
  toggleAutoRefresh: () => void;
  /** Seconds between refreshes — `ZM_WEB_REFRESH_LOGS`. */
  refreshSeconds: number;

  /** Ids of the ticked rows on this page (legacy's checkbox column). */
  selectedIds: number[];
  isSelected: (id: number) => boolean;
  toggleSelected: (id: number) => void;
  /** The header checkbox: tick every row on the page, or none. */
  allSelected: boolean;
  setAllSelected: (on: boolean) => void;
  clearSelection: () => void;
  /** Auto refresh is held while rows are ticked, as legacy holds it. */
  refreshPaused: boolean;

  /** What Clear Logs would delete: the ticked rows, the filtered set, or the lot. */
  clearTarget: 'selected' | 'filtered' | 'all';
  /** True while the Clear Logs confirmation is open. */
  confirmingClear: boolean;
  askClear: () => void;
  cancelClear: () => void;
  /** `DELETE /logs?ids=` for ticked rows, else with the filters on screen. */
  confirmClear: () => void;
  clearing: boolean;
  clearError: Error | null;
  /** Result line from the last successful clear, or null. */
  clearedMessage: string | null;
  dismissCleared: () => void;
  /** True when Clear Logs would delete a filtered subset, not the lot. */
  clearIsFiltered: boolean;
}

/**
 * Log viewer state. Every filter — component, exact levels or a severity
 * threshold, server, message search, date range — and the sort column and
 * direction round-trip through the URL and are applied by the backend
 * (zm-api#21, #142), so the counts and the pager describe the whole
 * matching set, not one page. Column picks persist in localStorage; ticked
 * rows live for as long as the page they were ticked on.
 */
export function useLogsPage(): LogsPageState {
  const { isAuthenticated } = useAuthStore();
  const search = useSearch({ from: '/logs/' });
  const navigate = useNavigate({ from: '/logs/' });

  const [pageSize, setPageSizeState] = useState<number>(loadPageSizePref);
  const page = search.page ?? 1;
  const componentFilter = search.component ?? '';
  const minLevel = search.min_level;
  const levelParam = search.level;
  const levels = useMemo(() => parseLevelCodes(levelParam), [levelParam]);
  const serverFilter = search.server_id;
  const messageQuery = search.q ?? '';
  const startInput = search.start ?? '';
  const endInput = search.end ?? '';
  const sort: LogSort = search.sort === 'asc' ? 'asc' : 'desc';
  const sortBy: LogSortField = search.sort_by ?? 'time';

  // Local mirror of the search box so each keystroke doesn't push history.
  const [searchDraft, setSearchDraft] = useMirroredState(messageQuery);

  const [showColumns, setShowColumns] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<LogColumnKey[]>(loadColumnPrefs);

  // Persist column picks across reloads. localStorage parallels the legacy
  // `zmLogsTable` cookie + `data-cookie-expire=2y`.
  useEffect(() => {
    try {
      window.localStorage.setItem(COLUMN_PREF_KEY, JSON.stringify(visibleColumns));
    } catch { /* quota / private mode — ignore */ }
  }, [visibleColumns]);

  const setSearch = useCallback((patch: Partial<LogsSearchParams>) => {
    navigate({
      search: (prev) => {
        const next: Partial<LogsSearchParams> = { ...prev, ...patch };
        // Drop empty / undefined keys so the URL stays clean.
        (Object.keys(next) as (keyof LogsSearchParams)[]).forEach((k) => {
          if (next[k] === undefined || next[k] === '' || next[k] === null) {
            delete next[k];
          }
        });
        return next;
      },
      replace: true,
    });
  }, [navigate]);

  // Typing is the whole gesture: commit the draft once the operator stops.
  // Without this the search box only reached the API on Enter or blur, so a
  // typed query looked ignored (`/logs?page=1&page_size=25&sort=desc`).
  useEffect(() => {
    if (searchDraft === messageQuery) return;
    const id = window.setTimeout(
      () => setSearch({ q: searchDraft || undefined, page: undefined }),
      LOGS_SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(id);
  }, [searchDraft, messageQuery, setSearch]);

  const setPageSize = (n: number) => {
    if (!LOGS_PAGE_SIZE_OPTIONS.includes(n)) return;
    setPageSizeState(n);
    try { window.localStorage.setItem(PAGE_SIZE_PREF_KEY, String(n)); } catch { /* ignore */ }
    setSearch({ page: undefined });
  };

  // The date inputs are local wall clock; the API wants Unix seconds.
  const startUnix = useMemo(() => dateInputToUnix(startInput), [startInput]);
  const endUnix = useMemo(() => dateInputToUnix(endInput), [endInput]);

  /** The filter set the view is showing — shared by the list and the clear. */
  const filters = {
    component: componentFilter || undefined,
    min_level: minLevel,
    level: levelCodesToApi(levels),
    search: messageQuery.trim() || undefined,
    start: startUnix ?? undefined,
    end: endUnix ?? undefined,
    server_id: serverFilter,
  };
  const clearIsFiltered = Object.values(filters).some((v) => v !== undefined);

  // Ticked rows belong to the view they were ticked on: any change to what
  // the table shows (page, filter, sort) starts the selection over. The
  // selection carries the view it was made in, so a stale one reads empty.
  const viewKey = JSON.stringify([
    page, pageSize, sort, sortBy, componentFilter, minLevel, levelParam, serverFilter,
    messageQuery, startUnix, endUnix,
  ]);
  const [selection, setSelection] = useState<{ key: string; ids: ReadonlySet<number> }>(
    () => ({ key: viewKey, ids: new Set() }),
  );
  const selectedSet = selection.key === viewKey ? selection.ids : EMPTY_IDS;

  // Legacy reads `ZM_WEB_REFRESH_LOGS`: 0 means the table ships with auto
  // refresh off, anything else is the interval in seconds and the toggle
  // starts on (`log.php:155-158`). The button flips it for the session, as
  // `manageAutoRefreshBtn` does — legacy persists nothing either.
  const refreshSeconds = useZmConfig('ZM_WEB_REFRESH_LOGS', 30);
  const [autoRefreshOverride, setAutoRefreshOverride] = useState<boolean | null>(null);
  const autoRefresh = autoRefreshOverride ?? refreshSeconds > 0;
  // A selection holds the scheduled refresh so the ticked rows stay put
  // (`logpanel.js` `ajaxRequest`: "avoid disturbing the user").
  const refreshPaused = selectedSet.size > 0;

  const { data, isLoading, refetch, isFetching, isError, error } = useQuery({
    queryKey: [
      'logs', page, pageSize, sort, sortBy, componentFilter, minLevel, levelParam, serverFilter,
      messageQuery, startUnix, endUnix,
    ],
    queryFn: () => listLogs({
      ...filters, page, page_size: pageSize, sort,
      sort_by: sortBy === 'time' ? undefined : sortBy,
      unfiltered_total: true,
    }),
    enabled: isAuthenticated,
    refetchInterval: autoRefresh && !refreshPaused ? Math.max(5, refreshSeconds || 30) * 1000 : false,
  });

  // Legacy's Component options are `SELECT DISTINCT Component FROM Logs`
  // (`logpanel.php:104`); zm-api#142 serves the same list.
  const { data: componentsData } = useQuery({
    queryKey: ['logComponents'],
    queryFn: listLogComponents,
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  // Hide the Server dropdown on single-server installs — parity with legacy.
  // We only fetch the list once; servers don't churn.
  const { data: serversData } = useQuery({
    queryKey: ['servers'],
    queryFn: () => listServers({ page: 1, page_size: 100 }),
    enabled: isAuthenticated,
  });
  const servers = useMemo(() => serversData?.items ?? [], [serversData]);
  const showServerFilter = servers.length > 1;

  const logs: LogEntry[] = useMemo(() => data?.items ?? [], [data]);

  const summary = useMemo(() => summarizeLogs(logs), [logs]);
  const totalPages = data?.last_page ?? 1;

  // The table's own components; the page's rows only stand in when the
  // components route is not there (an older zm-api). A component in the
  // URL is always offered, so the select can show what is applied.
  const allComponents = useMemo(() => {
    const set = new Set<string>(componentsData ?? logs.map((l) => l.component));
    for (const c of componentFilter.split(',')) if (c) set.add(c);
    return Array.from(set).sort();
  }, [componentsData, logs, componentFilter]);

  const serverLookup = useMemo(() => {
    const m: Record<number, string> = {};
    servers.forEach((s) => { m[s.id] = s.name; });
    return m;
  }, [servers]);

  // Only ids still on screen count: a manual refresh can drop a ticked row.
  const selectedIds = useMemo(
    () => logs.filter((l) => selectedSet.has(l.id)).map((l) => l.id),
    [logs, selectedSet],
  );
  const allSelected = logs.length > 0 && selectedIds.length === logs.length;
  const setIds = (ids: ReadonlySet<number>) => setSelection({ key: viewKey, ids });
  const toggleSelected = (id: number) => {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id); else next.add(id);
    setIds(next);
  };

  const exportCsv = () => {
    const csv = logsToCsv(logs, visibleColumns);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadCsv(`zm-logs-${stamp}.csv`, csv);
  };

  // Clear Logs — legacy's destructive toolbar button. Ticked rows go by id
  // (`logpanel.js` `deleteLogs`); with nothing ticked the clear is scoped to
  // whatever the view is filtered to, so the confirmation can name what goes.
  const queryClient = useQueryClient();
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearedMessage, setClearedMessage] = useState<string | null>(null);
  const clearTarget: LogsPageState['clearTarget'] =
    selectedIds.length > 0 ? 'selected' : clearIsFiltered ? 'filtered' : 'all';
  const clearMutation = useMutation({
    mutationFn: (ids: number[]) => clearLogs(ids.length ? { ids: ids.join(',') } : filters),
    onSuccess: (res) => {
      setConfirmingClear(false);
      setClearedMessage(res?.message ?? '');
      setIds(EMPTY_IDS);
      queryClient.invalidateQueries({ queryKey: ['logs'] });
      queryClient.invalidateQueries({ queryKey: ['logComponents'] });
    },
  });

  return {
    isAuthenticated,
    isLoading,
    isFetching,
    isError,
    error: (error as Error | null) ?? null,
    refetch: () => { refetch(); },

    logs,
    total: data?.total ?? 0,
    totalUnfiltered: data?.total_unfiltered ?? null,
    summary,
    page,
    pageSize,
    pageSizeOptions: pageSizeOptionsFor(pageSize),
    setPageSize,
    totalPages,

    componentFilter,
    minLevel,
    setMinLevel: (v) => setSearch({ min_level: v, level: undefined, page: undefined }),
    levels,
    setLevels: (codes) => setSearch({ level: levelCodesParam(codes), min_level: undefined, page: undefined }),
    serverFilter,
    startInput,
    endInput,
    messageQuery,
    sort,
    sortBy,
    toggleSort: (field = 'time') => {
      const nextSort: LogSort = field === sortBy ? (sort === 'desc' ? 'asc' : 'desc') : 'asc';
      setSearch({
        sort_by: field === 'time' ? undefined : field,
        sort: nextSort === 'asc' ? 'asc' : undefined,
        page: undefined,
      });
    },
    searchDraft,
    setSearchDraft,
    commitSearchDraft: () => setSearch({ q: searchDraft || undefined, page: undefined }),
    setSearch,

    allComponents,
    servers,
    showServerFilter,
    serverLookup,

    showColumns,
    toggleColumns: () => setShowColumns((v) => !v),
    closeColumns: () => setShowColumns(false),
    visibleColumns,
    setVisibleColumns,

    exportCsv,

    autoRefresh,
    toggleAutoRefresh: () => setAutoRefreshOverride(!autoRefresh),
    refreshSeconds: refreshSeconds > 0 ? refreshSeconds : 30,

    selectedIds,
    isSelected: (id) => selectedSet.has(id),
    toggleSelected,
    allSelected,
    setAllSelected: (on) => setIds(on ? new Set(logs.map((l) => l.id)) : EMPTY_IDS),
    clearSelection: () => setIds(EMPTY_IDS),
    refreshPaused,

    clearTarget,
    confirmingClear,
    askClear: () => { setClearedMessage(null); setConfirmingClear(true); },
    cancelClear: () => setConfirmingClear(false),
    confirmClear: () => clearMutation.mutate(selectedIds),
    clearing: clearMutation.isPending,
    clearError: (clearMutation.error as Error | null) ?? null,
    clearedMessage,
    dismissCleared: () => setClearedMessage(null),
    clearIsFiltered,
  };
}

const EMPTY_IDS: ReadonlySet<number> = new Set();

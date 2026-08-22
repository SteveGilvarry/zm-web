import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useAuthStore } from '@/stores/auth';
import { clearLogs, listLogs, type LogEntry, type LogMinLevel, type LogSort } from '@/api/logs';
import { listServers } from '@/api/servers';
import { useDateTimeFormat } from '@/features/config/useDateTimeFormat';
import { downloadCsv, logsToCsv, type LogColumnKey } from './csv';
import { dateInputToUnix, parseLogTime, summarizeLogs } from './filter';
import { ALL_LOG_COLUMNS, DEFAULT_VISIBLE_LOG_COLUMNS } from './columns';

/** URL search params for `/logs/`; the route's `validateSearch` produces this. */
export interface LogsSearchParams {
  component?: string;
  /** Severity threshold ("this level or worse"), the API's `min_level`. */
  min_level?: LogMinLevel;
  server_id?: number;
  q?: string;
  start?: string;
  end?: string;
  sort?: LogSort;
  page?: number;
}

// Common ZoneMinder components — used as the component filter dropdown options.
// Anything that shows up in the data the user hasn't filtered to gets added
// to it as a discovered value.
const COMMON_COMPONENTS = [
  'zmc', 'zma', 'zmaudit', 'zmfilter', 'zmtrigger', 'zmwatch',
  'zm_api', 'zmpkg', 'zmupdate', 'web',
];

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

export const LOGS_PAGE_SIZE_OPTIONS: readonly number[] = [25, 50, 100, 200, 500];

const COLUMN_PREF_KEY = 'zm-web.logs.columns';
const PAGE_SIZE_PREF_KEY = 'zm-web.logs.pageSize';

function loadPageSizePref(): number {
  if (typeof window === 'undefined') return 50;
  const n = Number(window.localStorage.getItem(PAGE_SIZE_PREF_KEY));
  return LOGS_PAGE_SIZE_OPTIONS.includes(n) ? n : 50;
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
  serverFilter: number | undefined;
  startInput: string;
  endInput: string;
  messageQuery: string;
  /** Time-column order: `desc` (newest first) unless the header flips it. */
  sort: LogSort;
  toggleSort: () => void;
  /** Local mirror of the search box; committed to the URL on Enter/blur. */
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

  /** True while the Clear Logs confirmation is open. */
  confirmingClear: boolean;
  askClear: () => void;
  cancelClear: () => void;
  /** `DELETE /logs` with the filters currently on screen. */
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
 * Log viewer state. Every filter — component, severity threshold, server,
 * message search, date range — and the time-column order round-trip through
 * the URL and are applied by the backend (zm-api#21), so the counts and the
 * pager describe the whole matching set, not one page. Column picks persist
 * in localStorage.
 */
export function useLogsPage(): LogsPageState {
  const { isAuthenticated } = useAuthStore();
  const search = useSearch({ from: '/logs/' });
  const navigate = useNavigate({ from: '/logs/' });

  const [pageSize, setPageSizeState] = useState<number>(loadPageSizePref);
  const page = search.page ?? 1;
  const componentFilter = search.component ?? '';
  const minLevel = search.min_level;
  const serverFilter = search.server_id;
  const messageQuery = search.q ?? '';
  const startInput = search.start ?? '';
  const endInput = search.end ?? '';
  const sort: LogSort = search.sort === 'asc' ? 'asc' : 'desc';

  // Local mirror of the search box so each keystroke doesn't push history.
  const [searchDraft, setSearchDraft] = useState(messageQuery);
  useEffect(() => { setSearchDraft(messageQuery); }, [messageQuery]);

  const [showColumns, setShowColumns] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<LogColumnKey[]>(loadColumnPrefs);

  // Persist column picks across reloads. localStorage parallels the legacy
  // `zmLogsTable` cookie + `data-cookie-expire=2y`.
  useEffect(() => {
    try {
      window.localStorage.setItem(COLUMN_PREF_KEY, JSON.stringify(visibleColumns));
    } catch { /* quota / private mode — ignore */ }
  }, [visibleColumns]);

  const setSearch = (patch: Partial<LogsSearchParams>) => {
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
  };

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
    search: messageQuery.trim() || undefined,
    start: startUnix ?? undefined,
    end: endUnix ?? undefined,
    server_id: serverFilter,
  };
  const clearIsFiltered = Object.values(filters).some((v) => v !== undefined);

  const { data, isLoading, refetch, isFetching, isError, error } = useQuery({
    queryKey: [
      'logs', page, pageSize, sort, componentFilter, minLevel, serverFilter,
      messageQuery, startUnix, endUnix,
    ],
    queryFn: () => listLogs({ ...filters, page, page_size: pageSize, sort }),
    enabled: isAuthenticated,
    refetchInterval: 30_000,
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

  // Discover any components in the current page that aren't in our default
  // list, so the dropdown stays useful in installs we don't pre-know about.
  const allComponents = useMemo(() => {
    const set = new Set<string>(COMMON_COMPONENTS);
    logs.forEach((l) => set.add(l.component));
    return Array.from(set).sort();
  }, [logs]);

  const serverLookup = useMemo(() => {
    const m: Record<number, string> = {};
    servers.forEach((s) => { m[s.id] = s.name; });
    return m;
  }, [servers]);

  const exportCsv = () => {
    const csv = logsToCsv(logs, visibleColumns);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadCsv(`zm-logs-${stamp}.csv`, csv);
  };

  // Clear Logs — legacy's destructive toolbar button. Scoped to whatever the
  // view is filtered to, so the confirmation can name what goes.
  const queryClient = useQueryClient();
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearedMessage, setClearedMessage] = useState<string | null>(null);
  const clearMutation = useMutation({
    mutationFn: () => clearLogs(filters),
    onSuccess: (res) => {
      setConfirmingClear(false);
      setClearedMessage(res?.message ?? '');
      queryClient.invalidateQueries({ queryKey: ['logs'] });
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
    summary,
    page,
    pageSize,
    pageSizeOptions: LOGS_PAGE_SIZE_OPTIONS,
    setPageSize,
    totalPages,

    componentFilter,
    minLevel,
    serverFilter,
    startInput,
    endInput,
    messageQuery,
    sort,
    toggleSort: () => setSearch({ sort: sort === 'desc' ? 'asc' : undefined, page: undefined }),
    searchDraft,
    setSearchDraft,
    commitSearchDraft: () => setSearch({ q: searchDraft || undefined }),
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

    confirmingClear,
    askClear: () => { setClearedMessage(null); setConfirmingClear(true); },
    cancelClear: () => setConfirmingClear(false),
    confirmClear: () => clearMutation.mutate(),
    clearing: clearMutation.isPending,
    clearError: (clearMutation.error as Error | null) ?? null,
    clearedMessage,
    dismissCleared: () => setClearedMessage(null),
    clearIsFiltered,
  };
}

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useAuthStore } from '@/stores/auth';
import { listLogs, type LogEntry } from '@/api/logs';
import { listServers } from '@/api/servers';
import { downloadCsv, logsToCsv, type LogColumnKey } from './csv';
import {
  dateInputToMs,
  matchesMessageQuery,
  summarizeLogs,
  withinTimeRange,
} from './filter';
import { ALL_LOG_COLUMNS, DEFAULT_VISIBLE_LOG_COLUMNS } from './columns';

/** URL search params for `/logs/`; the route's `validateSearch` produces this. */
export interface LogsSearchParams {
  component?: string;
  level?: number;
  server_id?: number;
  q?: string;
  start?: string;
  end?: string;
  page?: number;
}

// Common ZoneMinder components — used as the component filter dropdown options.
// Anything that shows up in the data the user hasn't filtered to gets added
// to it as a discovered value.
const COMMON_COMPONENTS = [
  'zmc', 'zma', 'zmaudit', 'zmfilter', 'zmtrigger', 'zmwatch',
  'zm_api', 'zmpkg', 'zmupdate', 'web',
];

// ZM level convention: lower = more severe. We expose them at the natural
// thresholds an operator wants ("Errors only", "Errors + Warnings", etc.).
export const LEVEL_THRESHOLDS: ReadonlyArray<{ value: number | undefined; label: string }> = [
  { value: undefined, label: 'All' },
  { value: -1, label: 'Errors only' },
  { value: 0,  label: 'Warnings+' },
  { value: 1,  label: 'Info+' },
  { value: 2,  label: 'Debug+' },
];

const COLUMN_PREF_KEY = 'zm-dashboard.logs.columns';

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

export function formatLogTime(s: string): string {
  // time_key may be ISO-ish OR epoch seconds; show local time with seconds.
  let d: Date;
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    d = new Date(Number(s) * 1000);
  } else {
    d = new Date(s);
  }
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString([], {
    year: '2-digit', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
}

export interface LogsPageState {
  isAuthenticated: boolean;
  isLoading: boolean;
  isFetching: boolean;
  refetch: () => void;

  /** Current page after client-side message/date filtering. */
  logs: LogEntry[];
  total: number;
  summary: ReturnType<typeof summarizeLogs>;
  page: number;
  pageSize: number;
  totalPages: number;

  componentFilter: string;
  levelFilter: number | undefined;
  serverFilter: number | undefined;
  startInput: string;
  endInput: string;
  messageQuery: string;
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
}

/**
 * Log viewer state. Filters round-trip through the URL (component / level /
 * server hit the backend; message search + date range apply client-side over
 * the current page). Column picks persist in localStorage.
 */
export function useLogsPage(): LogsPageState {
  const { isAuthenticated } = useAuthStore();
  const search = useSearch({ from: '/logs/' });
  const navigate = useNavigate({ from: '/logs/' });

  const [pageSize] = useState(50);
  const page = search.page ?? 1;
  const componentFilter = search.component ?? '';
  const levelFilter = search.level;
  const serverFilter = search.server_id;
  const messageQuery = search.q ?? '';
  const startInput = search.start ?? '';
  const endInput = search.end ?? '';

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

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['logs', page, pageSize, componentFilter, levelFilter, serverFilter],
    queryFn: () =>
      listLogs({
        page,
        page_size: pageSize,
        component: componentFilter || undefined,
        level: levelFilter,
        server_id: serverFilter,
      }),
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

  const rawLogs: LogEntry[] = useMemo(() => data?.items ?? [], [data]);

  const startMs = useMemo(() => dateInputToMs(startInput), [startInput]);
  const endMs   = useMemo(() => dateInputToMs(endInput), [endInput]);

  // Apply client-side message search + date range over the current page.
  // The backend's other filters (component / level / server) round-trip
  // through the URL and the query.
  const filteredLogs = useMemo(() => {
    return rawLogs.filter(
      (l) => matchesMessageQuery(l, messageQuery) && withinTimeRange(l, startMs, endMs),
    );
  }, [rawLogs, messageQuery, startMs, endMs]);

  const summary = useMemo(() => summarizeLogs(filteredLogs), [filteredLogs]);
  const totalPages = data?.last_page ?? 1;

  // Discover any components in the current page that aren't in our default
  // list, so the dropdown stays useful in installs we don't pre-know about.
  const allComponents = useMemo(() => {
    const set = new Set<string>(COMMON_COMPONENTS);
    rawLogs.forEach((l) => set.add(l.component));
    return Array.from(set).sort();
  }, [rawLogs]);

  const serverLookup = useMemo(() => {
    const m: Record<number, string> = {};
    servers.forEach((s) => { m[s.id] = s.name; });
    return m;
  }, [servers]);

  const exportCsv = () => {
    const csv = logsToCsv(filteredLogs, visibleColumns);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadCsv(`zm-logs-${stamp}.csv`, csv);
  };

  return {
    isAuthenticated,
    isLoading,
    isFetching,
    refetch: () => { refetch(); },

    logs: filteredLogs,
    total: data?.total ?? 0,
    summary,
    page,
    pageSize,
    totalPages,

    componentFilter,
    levelFilter,
    serverFilter,
    startInput,
    endInput,
    messageQuery,
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
  };
}

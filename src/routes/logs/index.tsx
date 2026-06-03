import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import {
  Activity, ChevronLeft, ChevronRight, AlertOctagon, AlertTriangle,
  Info, Bug, RefreshCw, Download, Columns3, Search,
} from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { useAuthStore } from '@/stores/auth';
import { listLogs, levelLabel, levelColor, type LogEntry } from '@/api/logs';
import { listServers } from '@/api/servers';
import {
  downloadCsv,
  logsToCsv,
  LOG_COLUMN_LABELS,
  type LogColumnKey,
} from '@/features/logs/csv';
import {
  dateInputToMs,
  matchesMessageQuery,
  summarizeLogs,
  withinTimeRange,
} from '@/features/logs/filter';
import {
  ALL_LOG_COLUMNS,
  ColumnPicker,
  DEFAULT_VISIBLE_LOG_COLUMNS,
} from '@/features/logs/ColumnPicker';
import { SummaryStrip } from '@/features/logs/SummaryStrip';

interface LogsSearchParams {
  component?: string;
  level?: number;
  server_id?: number;
  q?: string;
  start?: string;
  end?: string;
  page?: number;
}

export const Route = createFileRoute('/logs/')({
  component: LogsPage,
  validateSearch: (search: Record<string, unknown>): LogsSearchParams => ({
    component: typeof search.component === 'string' ? search.component : undefined,
    level: typeof search.level === 'number' ? search.level
      : typeof search.level === 'string' && search.level !== '' ? Number(search.level)
      : undefined,
    server_id: typeof search.server_id === 'number' ? search.server_id
      : typeof search.server_id === 'string' && search.server_id !== '' ? Number(search.server_id)
      : undefined,
    q: typeof search.q === 'string' ? search.q : undefined,
    start: typeof search.start === 'string' ? search.start : undefined,
    end: typeof search.end === 'string' ? search.end : undefined,
    page: typeof search.page === 'number' ? search.page
      : typeof search.page === 'string' && search.page !== '' ? Number(search.page)
      : undefined,
  }),
});

// Common ZoneMinder components — used as the component filter dropdown options.
// Anything that shows up in the data the user hasn't filtered to gets added
// to it as a discovered value.
const COMMON_COMPONENTS = [
  'zmc', 'zma', 'zmaudit', 'zmfilter', 'zmtrigger', 'zmwatch',
  'zm_api', 'zmpkg', 'zmupdate', 'web',
];

// ZM level convention: lower = more severe. We expose them at the natural
// thresholds an operator wants ("Errors only", "Errors + Warnings", etc.).
const LEVEL_THRESHOLDS = [
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

function LogsPage() {
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
  const servers = serversData?.items ?? [];
  const showServerFilter = servers.length > 1;

  const rawLogs: LogEntry[] = data?.items ?? [];

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

  const handleExportCsv = () => {
    const csv = logsToCsv(filteredLogs, visibleColumns);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadCsv(`zm-logs-${stamp}.csv`, csv);
  };

  if (!isAuthenticated) return null;

  return (
    <AppShell title="Log">
      <main className="flex-1 p-6 overflow-auto">
        {/* Summary strip */}
        <SummaryStrip
          summary={summary}
          total={data?.total ?? 0}
          shownCount={filteredLogs.length}
          page={page}
          pageSize={pageSize}
          onPickErrors={() => setSearch({ level: -1, page: undefined })}
          onPickWarnings={() => setSearch({ level: 0, page: undefined })}
          onPickInfo={() => setSearch({ level: 1, page: undefined })}
          activeLevel={levelFilter}
        />

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between mt-3 mb-4 gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted mr-1">
              Level
            </span>
            <div className="flex items-center gap-1 p-1 rounded-md bg-surface/50 border border-border-subtle">
              {LEVEL_THRESHOLDS.map((t) => (
                <button
                  key={t.label}
                  onClick={() => setSearch({ level: t.value, page: undefined })}
                  className={clsx(
                    'px-2 py-0.5 text-[11px] font-medium rounded transition-colors',
                    levelFilter === t.value
                      ? 'bg-cyan/20 text-cyan'
                      : 'text-text-muted hover:text-text-primary',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <select
              aria-label="Component filter"
              value={componentFilter}
              onChange={(e) => setSearch({ component: e.target.value || undefined, page: undefined })}
              className="px-3 py-1.5 text-xs bg-surface border border-border-subtle rounded-md text-text-primary focus:outline-none focus:border-cyan/50"
            >
              <option value="">All components</option>
              {allComponents.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            {showServerFilter && (
              <select
                aria-label="Server filter"
                value={serverFilter ?? ''}
                onChange={(e) =>
                  setSearch({
                    server_id: e.target.value ? Number(e.target.value) : undefined,
                    page: undefined,
                  })
                }
                className="px-3 py-1.5 text-xs bg-surface border border-border-subtle rounded-md text-text-primary focus:outline-none focus:border-cyan/50"
              >
                <option value="">All servers</option>
                {servers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}

            <label className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">
              Start
              <input
                type="datetime-local"
                aria-label="Start date"
                value={startInput}
                onChange={(e) => setSearch({ start: e.target.value || undefined, page: undefined })}
                className="px-2 py-1 text-xs bg-surface border border-border-subtle rounded-md text-text-primary focus:outline-none focus:border-cyan/50"
              />
            </label>
            <label className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">
              End
              <input
                type="datetime-local"
                aria-label="End date"
                value={endInput}
                onChange={(e) => setSearch({ end: e.target.value || undefined, page: undefined })}
                className="px-2 py-1 text-xs bg-surface border border-border-subtle rounded-md text-text-primary focus:outline-none focus:border-cyan/50"
              />
            </label>

            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="search"
                aria-label="Search messages"
                placeholder="Search messages…"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setSearch({ q: searchDraft || undefined });
                  }
                }}
                onBlur={() => {
                  if (searchDraft !== messageQuery) {
                    setSearch({ q: searchDraft || undefined });
                  }
                }}
                className="pl-7 pr-2 py-1 w-56 text-xs bg-surface border border-border-subtle rounded-md text-text-primary focus:outline-none focus:border-cyan/50"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setShowColumns((v) => !v)}
                className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md bg-surface border border-border-subtle text-text-secondary hover:border-cyan/40 hover:text-cyan transition-colors"
                aria-label="Columns"
                aria-expanded={showColumns}
              >
                <Columns3 size={12} />
                Columns
              </button>
              {showColumns && (
                <ColumnPicker
                  visible={visibleColumns}
                  onChange={setVisibleColumns}
                  onClose={() => setShowColumns(false)}
                />
              )}
            </div>

            <button
              onClick={handleExportCsv}
              disabled={filteredLogs.length === 0}
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md bg-surface border border-border-subtle text-text-secondary hover:border-cyan/40 hover:text-cyan transition-colors disabled:opacity-50 disabled:hover:border-border-subtle disabled:hover:text-text-secondary"
              aria-label="Download CSV"
            >
              <Download size={12} />
              CSV
            </button>

            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="p-1.5 rounded-md bg-surface border border-border-subtle text-text-muted hover:text-text-primary hover:border-cyan/40 transition-colors disabled:opacity-50"
              aria-label="Refresh logs"
            >
              <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Table */}
        <Panel icon={<Activity size={16} />} noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-surface/70 border-b border-border-subtle">
                <tr className="text-text-muted">
                  {visibleColumns.map((c) => (
                    <Th key={c} className={c === 'message' ? 'w-[55%]' : undefined}>
                      {LOG_COLUMN_LABELS[c]}
                    </Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <SkeletonRows columns={visibleColumns.length} />
                ) : filteredLogs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={visibleColumns.length}
                      className="py-12 text-center text-text-muted"
                    >
                      No log entries match the current filters.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((l) => (
                    <LogRow
                      key={l.id}
                      log={l}
                      columns={visibleColumns}
                      serverLookup={serverLookup}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-3 py-2 border-t border-border-subtle">
              <span className="text-[11px] text-text-muted font-mono">
                Page {page} / {totalPages} · {data?.total ?? 0} entries
              </span>
              <div className="flex items-center gap-1">
                <PagerBtn
                  onClick={() => setSearch({ page: Math.max(1, page - 1) || undefined })}
                  disabled={page === 1}
                >
                  <ChevronLeft size={12} />
                </PagerBtn>
                <PagerBtn
                  onClick={() => setSearch({ page: Math.min(totalPages, page + 1) })}
                  disabled={page >= totalPages}
                >
                  <ChevronRight size={12} />
                </PagerBtn>
              </div>
            </div>
          )}
        </Panel>
      </main>
    </AppShell>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={clsx(
        'px-3 py-2 text-left font-mono font-semibold uppercase tracking-wider text-[10px]',
        className,
      )}
    >
      {children}
    </th>
  );
}

function PagerBtn({
  onClick, disabled, children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'p-1 rounded border transition-colors',
        disabled
          ? 'border-border-subtle text-text-dim cursor-not-allowed'
          : 'border-border-subtle text-text-secondary hover:border-cyan/40 hover:text-cyan',
      )}
    >
      {children}
    </button>
  );
}

function LogRow({
  log, columns, serverLookup,
}: {
  log: LogEntry;
  columns: LogColumnKey[];
  serverLookup: Record<number, string>;
}) {
  return (
    <tr className="border-b border-border-subtle/50 hover:bg-surface/40 transition-colors">
      {columns.map((c) => (
        <LogCell key={c} column={c} log={log} serverLookup={serverLookup} />
      ))}
    </tr>
  );
}

function LogCell({
  column, log, serverLookup,
}: {
  column: LogColumnKey;
  log: LogEntry;
  serverLookup: Record<number, string>;
}) {
  switch (column) {
    case 'timestamp':
      return (
        <td className="px-3 py-1.5 font-mono text-text-muted whitespace-nowrap">
          {formatTime(log.time_key)}
        </td>
      );
    case 'level': {
      const icon =
        log.level <= -1 ? <AlertOctagon size={11} />
        : log.level === 0 ? <AlertTriangle size={11} />
        : log.level === 1 ? <Info size={11} />
        :                   <Bug size={11} />;
      return (
        <td className={clsx('px-3 py-1.5 font-mono whitespace-nowrap', levelColor(log.level))}>
          <span className="inline-flex items-center gap-1">
            {icon}
            {levelLabel(log.level)}
          </span>
        </td>
      );
    }
    case 'component':
      return (
        <td className="px-3 py-1.5 font-mono text-text-secondary whitespace-nowrap">
          {log.component}
        </td>
      );
    case 'server':
      return (
        <td className="px-3 py-1.5 font-mono text-text-muted whitespace-nowrap">
          {log.server_id != null ? (serverLookup[log.server_id] ?? `Server ${log.server_id}`) : '—'}
        </td>
      );
    case 'pid':
      return (
        <td className="px-3 py-1.5 font-mono text-text-muted whitespace-nowrap">
          {log.pid ?? '—'}
        </td>
      );
    case 'file':
      return (
        <td className="px-3 py-1.5 font-mono text-text-muted whitespace-nowrap">
          {log.file ?? '—'}
        </td>
      );
    case 'line':
      return (
        <td className="px-3 py-1.5 font-mono text-text-muted whitespace-nowrap">
          {log.line ?? '—'}
        </td>
      );
    case 'message':
      return (
        <td className="px-3 py-1.5 text-text-primary">
          <span className="font-mono whitespace-pre-wrap break-words">
            {log.message}
          </span>
          {log.file && (
            <span className="ml-2 text-[10px] font-mono text-text-dim">
              {log.file}{log.line ? `:${log.line}` : ''}
            </span>
          )}
        </td>
      );
  }
}

function SkeletonRows({ columns }: { columns: number }) {
  return (
    <>
      {Array.from({ length: 8 }, (_, i) => (
        <tr key={i} className="border-b border-border-subtle/50">
          <td colSpan={columns} className="px-3 py-2">
            <div className="h-3 bg-surface rounded animate-pulse" />
          </td>
        </tr>
      ))}
    </>
  );
}

function formatTime(s: string): string {
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

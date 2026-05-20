import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import {
  Activity, ChevronLeft, ChevronRight, AlertOctagon, AlertTriangle,
  Info, Bug, RefreshCw,
} from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { useAuthStore } from '@/stores/auth';
import { listLogs, levelLabel, levelColor, type LogEntry } from '@/api/logs';

export const Route = createFileRoute('/logs/')({
  component: LogsPage,
});

// Common ZoneMinder components — used as the level filter dropdown options.
// Anything that shows up in the data the user hasn't filtered to gets added
// below as a discovered value.
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

function LogsPage() {
  const { isAuthenticated } = useAuthStore();
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [componentFilter, setComponentFilter] = useState<string>('');
  const [levelFilter, setLevelFilter] = useState<number | undefined>(undefined);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['logs', page, pageSize, componentFilter, levelFilter],
    queryFn: () =>
      listLogs({
        page,
        page_size: pageSize,
        component: componentFilter || undefined,
        level: levelFilter,
      }),
    enabled: isAuthenticated,
    refetchInterval: 30_000,
  });

  const logs: LogEntry[] = data?.items ?? [];
  const totalPages = data?.last_page ?? 1;

  // Discover any components in the current page that aren't in our default
  // list, so the dropdown stays useful in installs we don't pre-know about.
  const allComponents = useMemo(() => {
    const set = new Set<string>(COMMON_COMPONENTS);
    logs.forEach((l) => set.add(l.component));
    return Array.from(set).sort();
  }, [logs]);

  if (!isAuthenticated) return null;

  return (
    <AppShell title="Log">
      <main className="flex-1 p-6 overflow-auto">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between mb-4 gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted mr-1">
              Level
            </span>
            <div className="flex items-center gap-1 p-1 rounded-md bg-surface/50 border border-border-subtle">
              {LEVEL_THRESHOLDS.map((t) => (
                <button
                  key={t.label}
                  onClick={() => {
                    setLevelFilter(t.value);
                    setPage(1);
                  }}
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
              value={componentFilter}
              onChange={(e) => {
                setComponentFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-1.5 text-xs bg-surface border border-border-subtle rounded-md text-text-primary focus:outline-none focus:border-cyan/50"
            >
              <option value="">All components</option>
              {allComponents.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-1.5 rounded-md bg-surface border border-border-subtle text-text-muted hover:text-text-primary hover:border-cyan/40 transition-colors disabled:opacity-50"
            aria-label="Refresh logs"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Table */}
        <Panel icon={<Activity size={16} />} noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-surface/70 border-b border-border-subtle">
                <tr className="text-text-muted">
                  <Th>Time</Th>
                  <Th>Level</Th>
                  <Th>Component</Th>
                  <Th>PID</Th>
                  <Th className="w-[55%]">Message</Th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <SkeletonRows />
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-text-muted">
                      No log entries match the current filters.
                    </td>
                  </tr>
                ) : (
                  logs.map((l) => <LogRow key={l.id} log={l} />)
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
                <PagerBtn onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                  <ChevronLeft size={12} />
                </PagerBtn>
                <PagerBtn
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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

function LogRow({ log }: { log: LogEntry }) {
  const icon = log.level <= -1 ? <AlertOctagon size={11} />
    : log.level === 0          ? <AlertTriangle size={11} />
    : log.level === 1          ? <Info size={11} />
                                : <Bug size={11} />;

  return (
    <tr className="border-b border-border-subtle/50 hover:bg-surface/40 transition-colors">
      <td className="px-3 py-1.5 font-mono text-text-muted whitespace-nowrap">
        {formatTime(log.time_key)}
      </td>
      <td className={clsx('px-3 py-1.5 font-mono whitespace-nowrap', levelColor(log.level))}>
        <span className="inline-flex items-center gap-1">
          {icon}
          {levelLabel(log.level)}
        </span>
      </td>
      <td className="px-3 py-1.5 font-mono text-text-secondary whitespace-nowrap">
        {log.component}
      </td>
      <td className="px-3 py-1.5 font-mono text-text-muted whitespace-nowrap">
        {log.pid ?? '—'}
      </td>
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
    </tr>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }, (_, i) => (
        <tr key={i} className="border-b border-border-subtle/50">
          <td colSpan={5} className="px-3 py-2">
            <div className="h-3 bg-surface rounded animate-pulse" />
          </td>
        </tr>
      ))}
    </>
  );
}

function formatTime(s: string): string {
  // time_key is an ISO-ish string; show local time with seconds.
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString([], {
    year: '2-digit', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
}

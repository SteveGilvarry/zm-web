import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import {
  Activity, ChevronLeft, ChevronRight, AlertOctagon, AlertTriangle,
  Info, Bug, RefreshCw, Download, Columns3, Search,
} from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { levelLabel, levelColor, type LogEntry } from '@/api/logs';
import { type LogColumnKey } from '@/features/logs/csv';
import { ColumnPicker } from '@/features/logs/ColumnPicker';
import { SummaryStrip } from '@/features/logs/SummaryStrip';
import { LEVEL_THRESHOLDS, formatLogTime, useLogsPage } from '@/features/logs/useLogsPage';
import { useDocumentTitle } from '../layouts/useDocumentTitle';

/** Column headers, keyed by column id so `t()` sees literal keys. */
function useColumnLabels(): Record<LogColumnKey, string> {
  const { t } = useTranslation();
  return {
    timestamp: t('Timestamp'),
    level: t('Level'),
    component: t('Component'),
    server: t('Server'),
    pid: t('PID'),
    file: t('File'),
    line: t('Line'),
    message: t('Message'),
  };
}

/** Labels for the level-threshold chips (values come from LEVEL_THRESHOLDS). */
function useLevelThresholdLabel(): (value: number | undefined) => string {
  const { t } = useTranslation();
  return (value) => {
    switch (value) {
      case -1: return t('Errors only');
      case 0: return t('Warnings+');
      case 1: return t('Info+');
      case 2: return t('Debug+');
      default: return t('All');
    }
  };
}

/** Display label for a numeric log level (wire value stays numeric). */
function useLevelLabel(): (level: number) => string {
  const { t } = useTranslation();
  return (level) => {
    switch (level) {
      case -3: return t('PANIC');
      case -2: return t('FATAL');
      case -1: return t('ERROR');
      case 0: return t('WARNING');
      case 1: return t('INFO');
      case 2: return t('DEBUG');
      default: return levelLabel(level);
    }
  };
}

/** Log viewer — Mission Control. Summary strip, filter toolbar, dense table. */
export default function LogsPage() {
  const { t } = useTranslation();
  const s = useLogsPage();
  const columnLabels = useColumnLabels();
  const thresholdLabel = useLevelThresholdLabel();
  useDocumentTitle(t('Log'));
  const {
    logs: filteredLogs, total, summary, page, pageSize, totalPages,
    componentFilter, levelFilter, serverFilter, startInput, endInput, messageQuery,
    searchDraft, setSearchDraft, setSearch,
    allComponents, servers, showServerFilter, serverLookup,
    showColumns, visibleColumns, setVisibleColumns,
    isLoading, isFetching,
  } = s;

  if (!s.isAuthenticated) return null;

  return (
    <AppShell title={t('Log')}>
      <main className="flex-1 p-6 overflow-auto">
        {/* Summary strip */}
        <SummaryStrip
          summary={summary}
          total={total}
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
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted me-1">
              {t('Level')}
            </span>
            <div className="flex items-center gap-1 p-1 rounded-md bg-surface/50 border border-border-subtle">
              {LEVEL_THRESHOLDS.map((lvl) => (
                <button
                  key={lvl.label}
                  onClick={() => setSearch({ level: lvl.value, page: undefined })}
                  className={clsx(
                    'px-2 py-0.5 text-[11px] font-medium rounded transition-colors',
                    levelFilter === lvl.value
                      ? 'bg-cyan/20 text-cyan'
                      : 'text-text-muted hover:text-text-primary',
                  )}
                >
                  {thresholdLabel(lvl.value)}
                </button>
              ))}
            </div>

            <select
              aria-label={t('Component filter')}
              value={componentFilter}
              onChange={(e) => setSearch({ component: e.target.value || undefined, page: undefined })}
              className="px-3 py-1.5 text-xs bg-surface border border-border-subtle rounded-md text-text-primary focus:outline-none focus:border-cyan/50"
            >
              <option value="">{t('All components')}</option>
              {allComponents.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            {showServerFilter && (
              <select
                aria-label={t('Server filter')}
                value={serverFilter ?? ''}
                onChange={(e) =>
                  setSearch({
                    server_id: e.target.value ? Number(e.target.value) : undefined,
                    page: undefined,
                  })
                }
                className="px-3 py-1.5 text-xs bg-surface border border-border-subtle rounded-md text-text-primary focus:outline-none focus:border-cyan/50"
              >
                <option value="">{t('All servers')}</option>
                {servers.map((sv) => (
                  <option key={sv.id} value={sv.id}>{sv.name}</option>
                ))}
              </select>
            )}

            <label className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">
              {t('Start')}
              <input
                type="datetime-local"
                aria-label={t('Start date')}
                value={startInput}
                onChange={(e) => setSearch({ start: e.target.value || undefined, page: undefined })}
                className="px-2 py-1 text-xs bg-surface border border-border-subtle rounded-md text-text-primary focus:outline-none focus:border-cyan/50"
              />
            </label>
            <label className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">
              {t('End')}
              <input
                type="datetime-local"
                aria-label={t('End date')}
                value={endInput}
                onChange={(e) => setSearch({ end: e.target.value || undefined, page: undefined })}
                className="px-2 py-1 text-xs bg-surface border border-border-subtle rounded-md text-text-primary focus:outline-none focus:border-cyan/50"
              />
            </label>

            <div className="relative">
              <Search size={12} className="absolute start-2 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="search"
                aria-label={t('Search messages')}
                placeholder={t('Search messages…')}
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    s.commitSearchDraft();
                  }
                }}
                onBlur={() => {
                  if (searchDraft !== messageQuery) {
                    s.commitSearchDraft();
                  }
                }}
                className="ps-7 pe-2 py-1 w-56 text-xs bg-surface border border-border-subtle rounded-md text-text-primary focus:outline-none focus:border-cyan/50"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={s.toggleColumns}
                className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md bg-surface border border-border-subtle text-text-secondary hover:border-cyan/40 hover:text-cyan transition-colors"
                aria-label={t('Columns')}
                aria-expanded={showColumns}
              >
                <Columns3 size={12} />
                {t('Columns')}
              </button>
              {showColumns && (
                <ColumnPicker
                  visible={visibleColumns}
                  onChange={setVisibleColumns}
                  onClose={s.closeColumns}
                />
              )}
            </div>

            <button
              onClick={s.exportCsv}
              disabled={filteredLogs.length === 0}
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md bg-surface border border-border-subtle text-text-secondary hover:border-cyan/40 hover:text-cyan transition-colors disabled:opacity-50 disabled:hover:border-border-subtle disabled:hover:text-text-secondary"
              aria-label={t('Download CSV')}
            >
              <Download size={12} />
              CSV
            </button>

            <button
              onClick={s.refetch}
              disabled={isFetching}
              className="p-1.5 rounded-md bg-surface border border-border-subtle text-text-muted hover:text-text-primary hover:border-cyan/40 transition-colors disabled:opacity-50"
              aria-label={t('Refresh logs')}
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
                      {columnLabels[c]}
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
                      {t('No log entries match the current filters.')}
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
                {t('Page {{page}} / {{totalPages}} · {{total}} entries', { page, totalPages, total })}
              </span>
              <div className="flex items-center gap-1">
                <PagerBtn
                  onClick={() => setSearch({ page: Math.max(1, page - 1) || undefined })}
                  disabled={page === 1}
                  label={t('Previous page')}
                >
                  <ChevronLeft size={12} className="rtl:-scale-x-100" />
                </PagerBtn>
                <PagerBtn
                  onClick={() => setSearch({ page: Math.min(totalPages, page + 1) })}
                  disabled={page >= totalPages}
                  label={t('Next page')}
                >
                  <ChevronRight size={12} className="rtl:-scale-x-100" />
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
        'px-3 py-2 text-start font-mono font-semibold uppercase tracking-wider text-[10px]',
        className,
      )}
    >
      {children}
    </th>
  );
}

function PagerBtn({
  onClick, disabled, label, children,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
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
  const { t } = useTranslation();
  const levelText = useLevelLabel();
  switch (column) {
    case 'timestamp':
      return (
        <td className="px-3 py-1.5 font-mono text-text-muted whitespace-nowrap">
          {formatLogTime(log.time_key)}
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
            {levelText(log.level)}
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
          {log.server_id != null ? (serverLookup[log.server_id] ?? t('Server {{id}}', { id: log.server_id })) : '—'}
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
            <span className="ms-2 text-[10px] font-mono text-text-dim">
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

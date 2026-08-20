import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import {
  Activity, ChevronLeft, ChevronRight, AlertOctagon, AlertTriangle,
  Info, Bug, RefreshCw, Download, Columns3, Search, Skull,
} from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { QueryState } from '@/components/common/QueryState';
import { LOG_LEVEL, levelLabel, levelColor, levelRowTint, type LogEntry } from '@/api/logs';
import { type LogColumnKey } from '@/features/logs/csv';
import { ColumnPicker } from '@/features/logs/ColumnPicker';
import { SummaryStrip } from '@/features/logs/SummaryStrip';
import { LEVEL_CHIPS, formatLogTime, useLogsPage } from '@/features/logs/useLogsPage';
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

/**
 * Display label for a numeric log level (wire value stays numeric).
 * ZoneMinder's scale: -4 PANIC, -3 FATAL, -2 ERROR, -1 WARNING, 0 INFO, 1+ DEBUG.
 */
function useLevelLabel(): (level: number) => string {
  const { t } = useTranslation();
  return (level) => {
    if (level <= LOG_LEVEL.PANIC) return t('PANIC');
    switch (level) {
      case LOG_LEVEL.FATAL:   return t('FATAL');
      case LOG_LEVEL.ERROR:   return t('ERROR');
      case LOG_LEVEL.WARNING: return t('WARNING');
      case LOG_LEVEL.INFO:    return t('INFO');
      case LOG_LEVEL.DEBUG:   return t('DEBUG');
      default: return levelLabel(level);
    }
  };
}

/** Chip labels by chip code (kept literal for the extractor). */
function useChipLabel(): (code: string) => string {
  const { t } = useTranslation();
  return (code) => {
    switch (code) {
      case 'PNC': return t('Panic');
      case 'FAT': return t('Fatal');
      case 'ERR': return t('Error');
      case 'WAR': return t('Warning');
      case 'INF': return t('Info');
      case 'DBG': return t('Debug');
      default: return t('All');
    }
  };
}

function LevelIcon({ level }: { level: number }) {
  if (level <= LOG_LEVEL.FATAL) return <Skull size={11} />;
  if (level === LOG_LEVEL.ERROR) return <AlertOctagon size={11} />;
  if (level === LOG_LEVEL.WARNING) return <AlertTriangle size={11} />;
  if (level === LOG_LEVEL.INFO) return <Info size={11} />;
  return <Bug size={11} />;
}

/** Log viewer — Mission Control. Summary strip, filter toolbar, dense table. */
export default function LogsPage() {
  const { t } = useTranslation();
  const s = useLogsPage();
  const columnLabels = useColumnLabels();
  const chipLabel = useChipLabel();
  useDocumentTitle(t('Log'));
  const {
    logs: filteredLogs, pageRowCount, total, summary, page, pageSize, totalPages,
    pageSizeOptions, setPageSize, pageLocalFiltering,
    componentFilter, levelFilter, serverFilter, startInput, endInput, messageQuery,
    searchDraft, setSearchDraft, setSearch,
    allComponents, servers, showServerFilter, serverLookup,
    showColumns, visibleColumns, setVisibleColumns,
    isLoading, isFetching, isError, error,
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
          onPickErrors={() => setSearch({ level: levelFilter === LOG_LEVEL.ERROR ? undefined : LOG_LEVEL.ERROR, page: undefined })}
          onPickWarnings={() => setSearch({ level: levelFilter === LOG_LEVEL.WARNING ? undefined : LOG_LEVEL.WARNING, page: undefined })}
          onPickInfo={() => setSearch({ level: levelFilter === LOG_LEVEL.INFO ? undefined : LOG_LEVEL.INFO, page: undefined })}
          onPickDebug={() => setSearch({ level: levelFilter === LOG_LEVEL.DEBUG ? undefined : LOG_LEVEL.DEBUG, page: undefined })}
          activeLevel={levelFilter}
          pageLocal={pageLocalFiltering}
        />

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between mt-3 mb-4 gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted me-1">
              {t('Level')}
            </span>
            <div
              role="group"
              aria-label={t('Level')}
              className="flex items-center gap-1 p-1 rounded-md bg-surface/50 border border-border-subtle"
            >
              {LEVEL_CHIPS.map((chip) => (
                <button
                  key={chip.code}
                  onClick={() => setSearch({ level: chip.value, page: undefined })}
                  aria-pressed={levelFilter === chip.value}
                  className={clsx(
                    'px-2 py-0.5 text-[11px] font-medium rounded transition-colors',
                    levelFilter === chip.value
                      ? 'bg-cyan/20 text-cyan'
                      : 'text-text-muted hover:text-text-primary',
                  )}
                >
                  {chipLabel(chip.code)}
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
            <label className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">
              {t('Per page')}
              <select
                aria-label={t('Rows per page')}
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="px-2 py-1 text-xs bg-surface border border-border-subtle rounded-md text-text-primary focus:outline-none focus:border-cyan/50"
              >
                {pageSizeOptions.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>

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

        {/* The backend can only bound `level` from below (>=), so an exact
            level, a message search or a date range is finished client-side
            on the rows of the current page. Say so rather than let "3 errors"
            read as a site-wide count. */}
        {pageLocalFiltering && (
          <p
            role="status"
            data-testid="logs-page-local-note"
            className="mb-2 text-[11px] text-amber font-mono"
          >
            {t('Level, search and date filters apply within the current page only ({{shown}} of {{rows}} rows match). Page through to see more.', { shown: filteredLogs.length, rows: pageRowCount })}
          </p>
        )}

        {/* Table */}
        <Panel icon={<Activity size={16} />} noPadding>
          <QueryState
            isLoading={isLoading}
            isError={isError}
            error={error}
            onRetry={s.refetch}
            empty={filteredLogs.length === 0}
            emptyMessage={t('No log entries match the current filters.')}
          >
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
                {filteredLogs.map((l) => (
                  <LogRow
                    key={l.id}
                    log={l}
                    columns={visibleColumns}
                    serverLookup={serverLookup}
                  />
                ))}
              </tbody>
            </table>
          </div>
          </QueryState>

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
    <tr
      className={clsx(
        'border-b border-border-subtle/50 hover:bg-surface/40 transition-colors',
        levelRowTint(log.level),
      )}
      data-level={log.level}
    >
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
    case 'level':
      return (
        <td className={clsx('px-3 py-1.5 font-mono whitespace-nowrap', levelColor(log.level))}>
          <span className="inline-flex items-center gap-1" title={log.code}>
            <LevelIcon level={log.level} />
            {levelText(log.level)}
          </span>
        </td>
      );
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

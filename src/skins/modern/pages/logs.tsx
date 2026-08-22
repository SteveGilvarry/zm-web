import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft, ChevronRight, AlertOctagon, AlertTriangle,
  ArrowDown, ArrowUp, Info, Bug, RefreshCw, Download, Columns3, Search, Skull, Trash2,
  SlidersHorizontal,
} from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { LOG_LEVEL, levelLabel, type LogEntry } from '@/api/logs';
import { type LogColumnKey } from '@/features/logs/csv';
import { ColumnPicker } from '@/features/logs/ColumnPicker';
import { SummaryStrip } from '@/features/logs/SummaryStrip';
import { LEVEL_CHIPS, useLogTimeFormat, useLogsPage } from '@/features/logs/useLogsPage';
import { ToolbarDisclosure } from '../components/ToolbarDisclosure';
import { useDocumentTitle } from '../layouts/useDocumentTitle';

const field = clsx(
  'bg-surface border border-border-subtle rounded',
  'text-fg placeholder:text-fg-faint',
  'focus:outline-none focus:border-accent transition-colors',
);
const toolBtn = 'p-1.5 rounded text-fg-dim hover:text-fg hover:bg-surface-2 transition-colors disabled:opacity-50';

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

/**
 * Severity is the one thing on this page that gets colour: fatal and error
 * read as danger, warning as warn, and everything below is neutral text
 * (docs/DESIGN.md). It marks the level cell only — a whole row washed in
 * red is decoration at the scale of a surface, not a state mark.
 */
function levelTone(level: number): string {
  if (level <= LOG_LEVEL.ERROR) return 'text-danger';
  if (level === LOG_LEVEL.WARNING) return 'text-warn';
  return 'text-fg-muted';
}

function LevelIcon({ level }: { level: number }) {
  if (level <= LOG_LEVEL.FATAL) return <Skull size={11} />;
  if (level === LOG_LEVEL.ERROR) return <AlertOctagon size={11} />;
  if (level === LOG_LEVEL.WARNING) return <AlertTriangle size={11} />;
  if (level === LOG_LEVEL.INFO) return <Info size={11} />;
  return <Bug size={11} />;
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

/**
 * Log viewer — the modern skin.
 *
 * One query line (severity, component, message search) then the table,
 * which owns the rest of the height and scrolls under its own pinned
 * header. The date window and the cluster's server picker are behind
 * Filters, counted so a bound set from a deep link is never invisible.
 * The severity counts and the pager sit in the status bar.
 */
export default function LogsPage() {
  const { t } = useTranslation();
  const s = useLogsPage();
  const columnLabels = useColumnLabels();
  const chipLabel = useChipLabel();
  useDocumentTitle(t('Log'));
  const formatLogTime = useLogTimeFormat();
  const {
    logs, total, summary, page, pageSize, totalPages,
    pageSizeOptions, setPageSize,
    componentFilter, minLevel, serverFilter, startInput, endInput, messageQuery,
    sort, toggleSort, searchDraft, setSearchDraft, setSearch,
    allComponents, servers, showServerFilter, serverLookup,
    showColumns, visibleColumns, setVisibleColumns,
    isLoading, isFetching, isError, error,
  } = s;

  if (!s.isAuthenticated) return null;

  // What is narrowing the list from behind the disclosure.
  const activeFilters = [
    startInput !== '', endInput !== '', serverFilter != null,
  ].filter(Boolean).length;

  return (
    <AppShell title={t('Log')}>
      <main className="flex-1 min-h-0 flex flex-col">
        {/* The query line: everything you change often, in one row. */}
        <div className="flex items-center gap-2 px-3 h-11 shrink-0 border-b border-border-subtle bg-surface">
          {/* Each chip is a threshold: that severity or worse. */}
          <div
            role="group"
            aria-label={t('Minimum level')}
            className="shrink-0 flex items-center gap-0.5 rounded border border-border-subtle p-0.5"
          >
            {LEVEL_CHIPS.map((chip) => (
              <button
                key={chip.code}
                onClick={() => setSearch({ min_level: chip.value, page: undefined })}
                aria-pressed={minLevel === chip.value}
                className={clsx(
                  'px-2 py-0.5 rounded text-xs transition-colors',
                  minLevel === chip.value
                    ? 'bg-accent/15 text-accent'
                    : 'text-fg-dim hover:text-fg',
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
            className={clsx(field, 'px-2 py-1 text-sm cursor-pointer')}
          >
            <option value="">{t('All components')}</option>
            {allComponents.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <div className="relative">
            <Search size={14} className="absolute start-2 top-1/2 -translate-y-1/2 text-fg-faint" aria-hidden />
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
              className={clsx(field, 'ps-7 pe-2 py-1 w-48 text-sm')}
            />
          </div>

          <ToolbarDisclosure label={t('Filters')} icon={SlidersHorizontal} count={activeFilters}>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs text-fg-dim">
                {t('Start')}
                <input
                  type="datetime-local"
                  aria-label={t('Start date')}
                  value={startInput}
                  onChange={(e) => setSearch({ start: e.target.value || undefined, page: undefined })}
                  className={clsx(field, 'px-2 py-1 text-sm')}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-fg-dim">
                {t('End')}
                <input
                  type="datetime-local"
                  aria-label={t('End date')}
                  value={endInput}
                  onChange={(e) => setSearch({ end: e.target.value || undefined, page: undefined })}
                  className={clsx(field, 'px-2 py-1 text-sm')}
                />
              </label>

              {showServerFilter && (
                <label className="flex flex-col gap-1 text-xs text-fg-dim">
                  {t('Server')}
                  <select
                    aria-label={t('Server filter')}
                    value={serverFilter ?? ''}
                    onChange={(e) =>
                      setSearch({
                        server_id: e.target.value ? Number(e.target.value) : undefined,
                        page: undefined,
                      })
                    }
                    className={clsx(field, 'px-2 py-1 text-sm cursor-pointer')}
                  >
                    <option value="">{t('All servers')}</option>
                    {servers.map((sv) => (
                      <option key={sv.id} value={sv.id}>{sv.name}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </ToolbarDisclosure>

          <span className="ms-auto" />

          <label className="shrink-0 flex items-center gap-1 text-xs text-fg-dim">
            {t('Per page')}
            <select
              aria-label={t('Rows per page')}
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className={clsx(field, 'px-1 py-0.5 text-xs cursor-pointer')}
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>

          <div className="relative">
            <button
              onClick={s.toggleColumns}
              className={clsx(toolBtn, 'flex items-center gap-1 text-xs')}
              aria-label={t('Columns')}
              aria-expanded={showColumns}
            >
              <Columns3 size={14} />
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
            disabled={logs.length === 0}
            className={toolBtn}
            aria-label={t('Download CSV')}
            title={t('Download CSV')}
          >
            <Download size={16} />
          </button>

          <button
            onClick={s.refetch}
            disabled={isFetching}
            className={toolBtn}
            aria-label={t('Refresh logs')}
          >
            <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
          </button>

          <RequirePerm feature="system" level="Edit">
            <button
              onClick={s.askClear}
              disabled={s.clearing}
              className="shrink-0 flex items-center gap-1 px-2 py-1 rounded text-xs text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
            >
              <Trash2 size={14} />
              {t('Clear Logs')}
            </button>
          </RequirePerm>
        </div>

        {s.clearedMessage !== null && (
          <p role="status" className="shrink-0 px-3 py-1.5 border-b border-border-subtle text-xs text-fg-muted">
            {s.clearedMessage || t('Logs cleared.')}{' '}
            <button type="button" onClick={s.dismissCleared} className="underline">{t('Dismiss')}</button>
          </p>
        )}
        {s.clearError && (
          <p role="alert" className="shrink-0 px-3 py-1.5 border-b border-border-subtle text-xs text-danger">
            {s.clearError.message}
          </p>
        )}

        <ConfirmDialog
          isOpen={s.confirmingClear}
          title={t('Clear Logs')}
          message={s.clearIsFiltered
            ? t('Delete every log row matching the filters on screen? This cannot be undone.')
            : t('Delete every row in the log table? This cannot be undone.')}
          confirmText={t('Clear Logs')}
          isLoading={s.clearing}
          onConfirm={s.confirmClear}
          onClose={s.cancelClear}
        />

        {/* The table is the page: it owns the remaining height and scrolls
            inside itself, so the query line and the pager stay put. */}
        <div className="flex-1 min-h-0 overflow-auto p-3">
          <QueryState
            isLoading={isLoading}
            isError={isError}
            error={error}
            onRetry={s.refetch}
            empty={logs.length === 0}
            emptyMessage={t('No log entries match the current filters.')}
          >
            <div className="overflow-x-auto rounded border border-border-subtle bg-surface">
              <table className="w-full text-sm">
                {/* The scroll container is the page area, so the header pins to it. */}
                <thead className="sticky top-0 z-10 bg-surface border-b border-border-subtle">
                  <tr>
                    {visibleColumns.map((c) => (
                      <Th
                        key={c}
                        className={c === 'message' ? 'w-[55%]' : undefined}
                        sort={c === 'timestamp' ? sort : undefined}
                        onSort={c === 'timestamp' ? toggleSort : undefined}
                        sortLabel={t('Sort by timestamp')}
                      >
                        {columnLabels[c]}
                      </Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <LogRow
                      key={l.id}
                      log={l}
                      columns={visibleColumns}
                      serverLookup={serverLookup}
                      formatLogTime={formatLogTime}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </QueryState>
        </div>

        {/* Status bar: what this page is showing, and how to leave it. */}
        <div className="flex items-center gap-3 px-3 py-2 shrink-0 border-t border-border-subtle bg-surface text-xs text-fg-dim">
          <div className="flex-1 min-w-0">
            <SummaryStrip
              summary={summary}
              total={total}
              shownCount={logs.length}
              page={page}
              pageSize={pageSize}
              onPickErrors={() => setSearch({ min_level: minLevel === 'error' ? undefined : 'error', page: undefined })}
              onPickWarnings={() => setSearch({ min_level: minLevel === 'warning' ? undefined : 'warning', page: undefined })}
              onPickInfo={() => setSearch({ min_level: minLevel === 'info' ? undefined : 'info', page: undefined })}
              onPickDebug={() => setSearch({ min_level: minLevel === 'debug' ? undefined : 'debug', page: undefined })}
              activeLevel={minLevel}
            />
          </div>

          {totalPages > 1 && (
            <div className="shrink-0 flex items-center gap-2">
              <span className="font-mono tabular-nums">
                {t('Page {{page}} / {{totalPages}} · {{total}} entries', { page, totalPages, total })}
              </span>
              <PagerBtn
                onClick={() => setSearch({ page: Math.max(1, page - 1) || undefined })}
                disabled={page === 1}
                label={t('Previous page')}
              >
                <ChevronLeft size={14} className="rtl:-scale-x-100" />
              </PagerBtn>
              <PagerBtn
                onClick={() => setSearch({ page: Math.min(totalPages, page + 1) })}
                disabled={page >= totalPages}
                label={t('Next page')}
              >
                <ChevronRight size={14} className="rtl:-scale-x-100" />
              </PagerBtn>
            </div>
          )}
        </div>
      </main>
    </AppShell>
  );
}

function Th({
  children, className, sort, onSort, sortLabel,
}: {
  children: React.ReactNode;
  className?: string;
  /** Present only on the sortable column; drives `aria-sort`. */
  sort?: 'asc' | 'desc';
  onSort?: () => void;
  sortLabel?: string;
}) {
  return (
    <th
      scope="col"
      aria-sort={sort ? (sort === 'asc' ? 'ascending' : 'descending') : undefined}
      className={clsx(
        'px-3 py-2 text-start text-xs font-medium text-fg-dim whitespace-nowrap',
        className,
      )}
    >
      {onSort ? (
        <button
          type="button"
          onClick={onSort}
          aria-label={sortLabel}
          className="inline-flex items-center gap-1 rounded-sm hover:text-fg transition-colors"
        >
          {children}
          {sort === 'asc' ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />}
        </button>
      ) : children}
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
        'p-1.5 rounded border border-border-subtle transition-colors',
        disabled ? 'text-fg-faint cursor-not-allowed' : 'text-fg hover:border-accent',
      )}
    >
      {children}
    </button>
  );
}

function LogRow({
  log, columns, serverLookup, formatLogTime,
}: {
  log: LogEntry;
  columns: LogColumnKey[];
  serverLookup: Record<number, string>;
  formatLogTime: (timeKey: string) => string;
}) {
  return (
    <tr
      className="border-b border-border-subtle last:border-0 hover:bg-surface-2 transition-colors"
      data-level={log.level}
    >
      {columns.map((c) => (
        <LogCell key={c} column={c} log={log} serverLookup={serverLookup} formatLogTime={formatLogTime} />
      ))}
    </tr>
  );
}

function LogCell({
  column, log, serverLookup, formatLogTime,
}: {
  column: LogColumnKey;
  log: LogEntry;
  serverLookup: Record<number, string>;
  formatLogTime: (timeKey: string) => string;
}) {
  const { t } = useTranslation();
  const levelText = useLevelLabel();
  switch (column) {
    case 'timestamp':
      return (
        <td className="px-3 py-1 font-mono tabular-nums text-fg-muted whitespace-nowrap">
          {formatLogTime(log.time_key)}
        </td>
      );
    case 'level':
      return (
        <td className={clsx('px-3 py-1 whitespace-nowrap', levelTone(log.level))}>
          <span className="inline-flex items-center gap-1" title={log.code}>
            <LevelIcon level={log.level} />
            {levelText(log.level)}
          </span>
        </td>
      );
    case 'component':
      return (
        <td className="px-3 py-1 font-mono text-fg-muted whitespace-nowrap">
          {log.component}
        </td>
      );
    case 'server':
      return (
        <td className="px-3 py-1 text-fg-muted whitespace-nowrap">
          {log.server_id != null ? (serverLookup[log.server_id] ?? t('Server {{id}}', { id: log.server_id })) : '—'}
        </td>
      );
    case 'pid':
      return (
        <td className="px-3 py-1 font-mono tabular-nums text-fg-muted whitespace-nowrap">
          {log.pid ?? '—'}
        </td>
      );
    case 'file':
      return (
        <td className="px-3 py-1 font-mono text-fg-muted whitespace-nowrap">
          {log.file ?? '—'}
        </td>
      );
    case 'line':
      return (
        <td className="px-3 py-1 font-mono tabular-nums text-fg-muted whitespace-nowrap">
          {log.line ?? '—'}
        </td>
      );
    case 'message':
      return (
        <td className="px-3 py-1 text-fg">
          <span className="whitespace-pre-wrap break-words">
            {log.message}
          </span>
          {log.file && (
            <span className="ms-2 font-mono text-xs text-fg-faint">
              {log.file}{log.line ? `:${log.line}` : ''}
            </span>
          )}
        </td>
      );
  }
}

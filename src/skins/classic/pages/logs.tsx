import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Columns3, Download, Maximize2, RefreshCw, RefreshCwOff, Trash2,
} from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { usePerms } from '@/features/auth/usePerms';
import { LOG_LEVEL, levelLabel, type LogEntry, type LogSortField } from '@/api/logs';
import { useDateTimeFormat } from '@/features/config/useDateTimeFormat';
import { useLogTimeFormat, useLogsPage } from '@/features/logs/useLogsPage';
import { LOG_LEVEL_CODES, type LogLevelCode } from '@/features/logs/levels';
import { useLogState, type LogState } from '@/features/logs/useLogState';
import { LogMessage } from '@/features/logs/LogMessage';
import { useDocumentTitle } from '@/skins/modern/layouts/useDocumentTitle';
import {
  ClassicButton, ClassicFilterField, ClassicPager, ClassicTable, ClassicTh, ClassicThead, ClassicToolbar,
} from '@/skins/classic/components/events/primitives';
import { classicInput, classicLink, classicSelect } from '@/skins/classic/components/events/styles';
import { ClassicChosen } from '@/skins/classic/components/Chosen';

/**
 * Legacy row classes (`logpanel.js` post-body, `skin.css:1921-1934`):
 * FAT/PNC bold on #ffcccc, ERR #ffcccc, WAR #ffe4b5, debug grey italic.
 */
function levelBand(level: number): string {
  if (level <= LOG_LEVEL.FATAL) return 'bg-[#ffcccc] font-bold';
  if (level === LOG_LEVEL.ERROR) return 'bg-[#ffcccc]';
  if (level === LOG_LEVEL.WARNING) return 'bg-[#ffe4b5]';
  if (level >= LOG_LEVEL.DEBUG) return 'bg-white text-[#666666] italic';
  return 'bg-white';
}

/** Bootstrap's `text-success` / `text-warning` / `text-danger` (`logpanel.js:77`). */
const STATE_CLASS: Record<LogState, string> = {
  ok: 'text-[#28a745]',
  alert: 'text-[#ffc107]',
  alarm: 'text-[#dc3545]',
};

/** The table's columns in legacy's order (`logpanel.php:204-216`). */
type ClassicLogColumn = 'datetime' | 'component' | 'server' | 'pid' | 'level' | 'message' | 'file' | 'line';
const CLASSIC_COLUMNS: ClassicLogColumn[] = ['datetime', 'component', 'server', 'pid', 'level', 'message', 'file', 'line'];

/**
 * The `sort` each header sends (`ajax/log.php:119-129`). Level sorts on
 * `Code`, as legacy's does; Server is not sortable.
 */
const SORT_FIELD: Partial<Record<ClassicLogColumn, LogSortField>> = {
  datetime: 'time', component: 'component', pid: 'pid', level: 'code',
  message: 'message', file: 'file', line: 'line',
};

const HIDDEN_PREF_KEY = 'zm-web.logs.classicHiddenColumns';

/** bootstrap-table's `data-cookie` column memory, kept per browser. */
function useHiddenColumns(): [ClassicLogColumn[], (c: ClassicLogColumn) => void] {
  const [hidden, setHidden] = useState<ClassicLogColumn[]>(() => {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(HIDDEN_PREF_KEY) ?? '[]') as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((c): c is ClassicLogColumn => CLASSIC_COLUMNS.includes(c as ClassicLogColumn))
        : [];
    } catch { return []; }
  });
  useEffect(() => {
    try { window.localStorage.setItem(HIDDEN_PREF_KEY, JSON.stringify(hidden)); } catch { /* ignore */ }
  }, [hidden]);
  const toggle = (c: ClassicLogColumn) =>
    setHidden((h) => (h.includes(c) ? h.filter((x) => x !== c) : [...h, c]));
  return [hidden, toggle];
}

/**
 * Log viewer — classic skin, after `includes/logpanel.php`: the State /
 * Total / Available / Displaying / Updated line, the toolbar (Back,
 * Refresh, Clear Logs, then the Component, Server, Level and date terms),
 * bootstrap-table's search / refresh / auto refresh / fullscreen / columns
 * / export, and a checkbox table sortable on every column. Same data as the
 * modern skin via `useLogsPage`.
 */
export default function ClassicLogsPage() {
  const { t } = useTranslation();
  const s = useLogsPage();
  const { can } = usePerms();
  const canEdit = can('system', 'Edit');
  useDocumentTitle(t('Log'));
  const formatLogTime = useLogTimeFormat();
  const { formatDateTime } = useDateTimeFormat();
  const logState = useLogState(s.isAuthenticated);
  const [hidden, toggleHidden] = useHiddenColumns();
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);
  const {
    logs, total, totalUnfiltered, page, pageSize, totalPages, pageSizeOptions, setPageSize,
    componentFilter, levels, setLevels, serverFilter,
    startInput, endInput, messageQuery, sort, sortBy, toggleSort, searchDraft, setSearchDraft, setSearch,
    allComponents, servers, showServerFilter, serverLookup, isLoading, isFetching,
  } = s;

  // "Updated:" in the status line — re-stamped when a fetch settles. Derived
  // during render (no effect), the same way the hooks sync draft state.
  const [stamp, setStamp] = useState(() => ({ fetching: isFetching, at: new Date() }));
  if (stamp.fetching !== isFetching) {
    setStamp({ fetching: isFetching, at: isFetching ? stamp.at : new Date() });
  }
  const updatedAt = stamp.at;

  if (!s.isAuthenticated) return null;

  // Server only exists on a multi-server install, as in legacy.
  const columns = CLASSIC_COLUMNS.filter((c) => (c !== 'server' || showServerFilter) && !hidden.includes(c));
  const fmt = (n: number) => n.toLocaleString();
  const stateLabel = logState === 'alarm' ? t('alarm') : logState === 'alert' ? t('alert') : t('ok');
  const first = logs.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = logs.length === 0 ? 0 : first + logs.length - 1;
  // Legacy's bracketed request status after the Updated time.
  const status = s.refreshPaused ? t('stopped') : isFetching ? t('in process') : null;

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void tableRef.current?.requestFullscreen?.();
  };

  // `data-click-to-select`: a click anywhere on the row ticks it, except on
  // the event links inside the message.
  const onRowClick = (e: MouseEvent, id: number) => {
    if ((e.target as HTMLElement).closest('a, input, button')) return;
    s.toggleSelected(id);
  };

  const columnLabel = (c: ClassicLogColumn): string => {
    switch (c) {
      case 'datetime': return t('Date/Time');
      case 'component': return t('Component');
      case 'server': return t('Server');
      case 'pid': return t('PID');
      case 'level': return t('Level');
      case 'message': return t('Message');
      case 'file': return t('File');
      case 'line': return t('Line');
    }
  };

  return (
    <AppShell title={t('Log')}>
      <main className="flex-1 p-4 overflow-auto bg-zinc-50">
        <div className="max-w-screen-2xl mx-auto space-y-3">
          <p className="text-center text-sm text-zinc-800" data-testid="log-status">
            {t('State')}:{' '}
            <span className={STATE_CLASS[logState]} data-testid="log-state">{stateLabel}</span>
            {' - '}
            {totalUnfiltered != null
              ? t('Total: {{total}} - Available: {{available}} - Displaying: {{first}} to {{last}} - Updated: {{time}}', {
                total: fmt(total), available: fmt(totalUnfiltered), first: fmt(first), last: fmt(last),
                time: formatDateTime(updatedAt),
              })
              : t('Total: {{total}} - Displaying: {{first}} to {{last}} - Updated: {{time}}', {
                total: fmt(total), first: fmt(first), last: fmt(last), time: formatDateTime(updatedAt),
              })}
            {status && ` [${status}]`}
          </p>
          {s.clearedMessage !== null && (
            <p role="status" className="text-center text-xs text-[#0c5460] bg-[#d1ecf1] border border-[#bee5eb] px-2 py-1">
              {s.clearedMessage || t('Logs cleared.')}{' '}
              <button type="button" onClick={s.dismissCleared} className="underline">{t('Dismiss')}</button>
            </p>
          )}
          {s.clearError && (
            <p role="alert" className="text-center text-xs text-[#721c24] bg-[#f8d7da] border border-[#f5c6cb] px-2 py-1">
              {s.clearError.message}
            </p>
          )}

          <ClassicToolbar
            end={(
              <>
                <form
                  role="search"
                  aria-label={t('Search messages')}
                  onSubmit={(e) => { e.preventDefault(); s.commitSearchDraft(); }}
                >
                  <input
                    type="search"
                    value={searchDraft}
                    placeholder={t('Search')}
                    aria-label={t('Search messages')}
                    onChange={(e) => setSearchDraft(e.target.value)}
                    onBlur={() => { if (searchDraft !== messageQuery) s.commitSearchDraft(); }}
                    className={clsx(classicInput, 'w-48')}
                  />
                </form>
                <ClassicButton
                  tone="primary"
                  onClick={s.toggleAutoRefresh}
                  aria-pressed={s.autoRefresh}
                  aria-label={t('Auto refresh')}
                  title={s.autoRefresh
                    ? t('Auto refresh every {{count}} second', { count: s.refreshSeconds })
                    : t('Auto refresh off')}
                >
                  {s.autoRefresh
                    ? <RefreshCw size={14} aria-hidden />
                    : <RefreshCwOff size={14} aria-hidden />}
                </ClassicButton>
                <ClassicButton tone="primary" onClick={toggleFullscreen} aria-label={t('Toggle fullscreen')} title={t('Toggle fullscreen')}>
                  <Maximize2 size={14} aria-hidden />
                </ClassicButton>
                <div className="relative">
                  <ClassicButton
                    tone="primary"
                    onClick={() => setShowColumnMenu((v) => !v)}
                    aria-label={t('Columns')}
                    aria-expanded={showColumnMenu}
                    title={t('Columns')}
                  >
                    <Columns3 size={14} aria-hidden />
                  </ClassicButton>
                  {showColumnMenu && (
                    <>
                      <div className="fixed inset-0 z-10" aria-hidden onClick={() => setShowColumnMenu(false)} />
                      <div role="menu" aria-label={t('Columns')} className="absolute end-0 top-full mt-1 z-20 min-w-40 py-1 bg-white border border-[#ced4da] shadow">
                        {CLASSIC_COLUMNS.filter((c) => c !== 'server' || showServerFilter).map((c) => (
                          <label key={c} className="flex items-center gap-2 px-3 py-1 text-sm text-zinc-800 hover:bg-zinc-100 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!hidden.includes(c)}
                              // bootstrap-table keeps at least one column on.
                              disabled={!hidden.includes(c) && columns.length === 1}
                              onChange={() => toggleHidden(c)}
                            />
                            {columnLabel(c)}
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <ClassicButton
                  tone="primary"
                  onClick={s.exportCsv}
                  disabled={logs.length === 0}
                  aria-label={t('Download CSV')}
                  title={t('Download CSV')}
                >
                  <Download size={14} aria-hidden />
                </ClassicButton>
              </>
            )}
          >
            <ClassicButton onClick={() => window.history.back()} aria-label={t('Back')} title={t('Back')}>
              <ArrowLeft size={14} className="rtl:-scale-x-100" aria-hidden />
            </ClassicButton>
            <ClassicButton tone="primary" onClick={s.refetch} aria-label={t('Refresh')} title={t('Refresh')}>
              <RefreshCw size={14} className={clsx(isFetching && 'animate-spin')} aria-hidden />
            </ClassicButton>
            {/* Legacy: disabled until rows are ticked; clears just those. */}
            {canEdit && (
              <ClassicButton
                tone="danger"
                onClick={s.askClear}
                disabled={s.clearing || s.selectedIds.length === 0}
                title={t('Clear Logs')}
              >
                <Trash2 size={14} aria-hidden />
                {t('Clear Logs')}
              </ClassicButton>
            )}

            <ClassicFilterField label={t('Component')} htmlFor="log-component" className="ms-2">
              <select
                id="log-component"
                value={componentFilter}
                onChange={(e) => setSearch({ component: e.target.value || undefined, page: undefined })}
                className={classicSelect}
              >
                <option value="">{t('All')}</option>
                {allComponents.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </ClassicFilterField>

            {showServerFilter && (
              <ClassicFilterField label={t('Server')} htmlFor="log-server">
                <select
                  id="log-server"
                  value={serverFilter ?? ''}
                  onChange={(e) => setSearch({
                    server_id: e.target.value ? Number(e.target.value) : undefined,
                    page: undefined,
                  })}
                  className={classicSelect}
                >
                  <option value="">{t('All')}</option>
                  {servers.map((sv) => <option key={sv.id} value={sv.id}>{sv.name}</option>)}
                </select>
              </ClassicFilterField>
            )}

            {/* Legacy's Chosen multi-select (placeholder "All"): exact levels, nothing picked = All. */}
            <ClassicFilterField label={t('Level')} htmlFor="log-level">
              <ClassicChosen
                id="log-level"
                label={t('Level')}
                placeholder={t('All')}
                options={LOG_LEVEL_CODES.map((code) => ({ value: code, label: code }))}
                value={levels}
                onChange={(next) => setLevels(next as LogLevelCode[])}
                className="w-24"
              />
            </ClassicFilterField>

            <ClassicFilterField label={t('Start Date/Time')} htmlFor="log-start">
              <input
                id="log-start"
                type="datetime-local"
                value={startInput}
                onChange={(e) => setSearch({ start: e.target.value || undefined, page: undefined })}
                className={classicInput}
              />
            </ClassicFilterField>
            <ClassicFilterField label={t('End Date/Time')} htmlFor="log-end">
              <input
                id="log-end"
                type="datetime-local"
                value={endInput}
                onChange={(e) => setSearch({ end: e.target.value || undefined, page: undefined })}
                className={classicInput}
              />
            </ClassicFilterField>
          </ClassicToolbar>

          <div ref={tableRef} className="bg-white">
            <QueryState
              isLoading={isLoading}
              isError={s.isError}
              error={s.error}
              onRetry={s.refetch}
              empty={logs.length === 0}
              emptyMessage={t('No matching records found')}
            >
              <ClassicTable testId="log-table">
                <ClassicThead>
                  <tr>
                    {canEdit && (
                      <th className="px-2 py-1.5 border-b border-[#dee2e6] w-8">
                        <input
                          type="checkbox"
                          aria-label={t('Select all')}
                          checked={s.allSelected}
                          onChange={(e) => s.setAllSelected(e.target.checked)}
                        />
                      </th>
                    )}
                    {columns.map((c) => {
                      const field = SORT_FIELD[c];
                      return (
                        <ClassicTh
                          key={c}
                          sortable={field !== undefined}
                          active={field !== undefined && field === sortBy}
                          dir={sort}
                          onSort={field ? () => toggleSort(field) : undefined}
                          numeric={c === 'line'}
                          className={c === 'message' ? 'w-full' : undefined}
                        >
                          {columnLabel(c)}
                        </ClassicTh>
                      );
                    })}
                  </tr>
                </ClassicThead>
                {/* Plain tbody: the striped ClassicTbody would paint over the level bands. */}
                <tbody>
                  {logs.map((log) => (
                    <LogRow
                      key={log.id}
                      log={log}
                      columns={columns}
                      formatLogTime={formatLogTime}
                      serverName={log.server_id != null ? serverLookup[log.server_id] : undefined}
                      selectable={canEdit}
                      selected={s.isSelected(log.id)}
                      onToggle={() => s.toggleSelected(log.id)}
                      onClick={canEdit ? (e) => onRowClick(e, log.id) : undefined}
                    />
                  ))}
                </tbody>
              </ClassicTable>
            </QueryState>
          </div>

          <ConfirmDialog
            isOpen={s.confirmingClear}
            title={t('Clear Logs Confirmation')}
            message={t('Are you sure you wish to delete the selected log entries?')}
            confirmText={t('Clear Logs')}
            isLoading={s.clearing}
            onConfirm={s.confirmClear}
            onClose={s.cancelClear}
          />

          <ClassicPager
            page={page}
            pageSize={pageSize}
            total={total}
            totalPages={totalPages}
            pageSizeOptions={pageSizeOptions}
            onPage={(n) => setSearch({ page: n <= 1 ? undefined : n })}
            onPageSize={setPageSize}
            shown={logs.length}
          />
        </div>
      </main>
    </AppShell>
  );
}

const cell = 'px-2 py-1.5 border-b border-[#dee2e6] align-top';

function LogRow({
  log, columns, formatLogTime, serverName, selectable, selected, onToggle, onClick,
}: {
  log: LogEntry;
  columns: ClassicLogColumn[];
  formatLogTime: (timeKey: string) => string;
  serverName: string | undefined;
  selectable: boolean;
  selected: boolean;
  onToggle: () => void;
  onClick?: (e: MouseEvent) => void;
}) {
  const { t } = useTranslation();
  const td = (c: ClassicLogColumn) => {
    switch (c) {
      case 'datetime': return <td key={c} className={clsx(cell, 'whitespace-nowrap')}>{formatLogTime(log.time_key)}</td>;
      case 'component': return <td key={c} className={clsx(cell, 'whitespace-nowrap')}>{log.component}</td>;
      case 'server': return <td key={c} className={clsx(cell, 'whitespace-nowrap')}>{serverName ?? log.server_id ?? ''}</td>;
      case 'pid': return <td key={c} className={clsx(cell, 'whitespace-nowrap tabular-nums')}>{log.pid ?? ''}</td>;
      case 'level':
        return (
          <td key={c} className={clsx(cell, 'whitespace-nowrap')} title={levelLabel(log.level)}>
            {log.code || levelLabel(log.level)}
          </td>
        );
      case 'message':
        return (
          <td key={c} className={clsx(cell, 'whitespace-pre-wrap break-words')}>
            <LogMessage message={log.message} className={classicLink} />
          </td>
        );
      case 'file': return <td key={c} className={clsx(cell, 'whitespace-nowrap')}>{log.file ?? ''}</td>;
      case 'line': return <td key={c} className={clsx(cell, 'whitespace-nowrap text-end tabular-nums')}>{log.line ?? ''}</td>;
    }
  };
  return (
    <tr
      className={clsx(levelBand(log.level), selectable && 'cursor-pointer')}
      data-level={log.level}
      data-testid={`log-row-${log.id}`}
      onClick={onClick}
    >
      {selectable && (
        <td className={cell}>
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            aria-label={t('Select log {{id}}', { id: log.id })}
          />
        </td>
      )}
      {columns.map(td)}
    </tr>
  );
}

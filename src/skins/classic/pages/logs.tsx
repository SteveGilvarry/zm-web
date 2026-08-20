import { useState } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Download, RefreshCw, Trash2 } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { LOG_LEVEL, levelLabel, type LogEntry } from '@/api/logs';
import { LEVEL_CHIPS, formatLogTime, useLogsPage } from '@/features/logs/useLogsPage';
import { useDocumentTitle } from '@/skins/modern/layouts/useDocumentTitle';
import {
  ClassicButton, ClassicFilterField, ClassicPager, ClassicTable, ClassicTh, ClassicThead, ClassicToolbar,
} from '@/skins/classic/components/events/primitives';
import { classicInput, classicSelect } from '@/skins/classic/components/events/styles';

/** Level dropdown labels by chip code (kept literal for the extractor). */
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

/** Legacy `?view=log` row bands: errors and worse red, warnings amber, the rest white. */
function levelBand(level: number): string {
  if (level <= LOG_LEVEL.ERROR) return 'bg-[#f8d7da]';
  if (level === LOG_LEVEL.WARNING) return 'bg-[#fff3cd]';
  return 'bg-white';
}

/**
 * Log viewer — classic skin. Status line, legacy filter bar (labels above the
 * controls), a fixed seven-column table banded by severity, bootstrap-table
 * footer. Same data as Mission Control via `useLogsPage`.
 */
export default function ClassicLogsPage() {
  const { t } = useTranslation();
  const s = useLogsPage();
  const chipLabel = useChipLabel();
  useDocumentTitle(t('Log'));
  const {
    logs, total, page, pageSize, totalPages, pageSizeOptions, setPageSize,
    pageLocalFiltering, componentFilter, levelFilter, serverFilter,
    startInput, endInput, messageQuery, searchDraft, setSearchDraft, setSearch,
    allComponents, servers, showServerFilter, isLoading, isFetching,
  } = s;

  // "Updated:" in the status line — re-stamped when a fetch settles. Derived
  // during render (no effect), the same way the hooks sync draft state.
  const [stamp, setStamp] = useState(() => ({ fetching: isFetching, at: new Date() }));
  if (stamp.fetching !== isFetching) {
    setStamp({ fetching: isFetching, at: isFetching ? stamp.at : new Date() });
  }
  const updatedAt = stamp.at;

  if (!s.isAuthenticated) return null;

  const first = logs.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = logs.length === 0 ? 0 : first + logs.length - 1;

  return (
    <AppShell title={t('Log')}>
      <main className="flex-1 p-4 overflow-auto bg-zinc-50">
        <div className="max-w-screen-2xl mx-auto space-y-3">
          <p className="text-center text-sm text-zinc-800" data-testid="log-status">
            {t('Total: {{total}} - Displaying: {{first}} to {{last}} - Updated: {{time}}', {
              total,
              first,
              last,
              time: updatedAt.toLocaleString(),
            })}
          </p>
          {pageLocalFiltering && (
            <p className="text-center text-xs text-[#856404]">
              {t('Level, search and date filters narrow the current page only; the total is server-wide.')}
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
            <RequirePerm feature="system" level="Edit">
              <ClassicButton tone="danger" disabled title={t('needs zm-api#21')}>
                <Trash2 size={14} aria-hidden />
                {t('CLEAR LOGS')}
              </ClassicButton>
            </RequirePerm>

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

            <ClassicFilterField label={t('Level')} htmlFor="log-level">
              <select
                id="log-level"
                value={levelFilter ?? ''}
                onChange={(e) => setSearch({
                  level: e.target.value === '' ? undefined : Number(e.target.value),
                  page: undefined,
                })}
                className={classicSelect}
              >
                {LEVEL_CHIPS.map((chip) => (
                  <option key={chip.code} value={chip.value ?? ''}>{chipLabel(chip.code)}</option>
                ))}
              </select>
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

          <QueryState
            isLoading={isLoading}
            onRetry={s.refetch}
            empty={logs.length === 0}
            emptyMessage={t('No matching records found')}
          >
            <ClassicTable testId="log-table">
              <ClassicThead>
                <tr>
                  <ClassicTh>{t('Date/Time')}</ClassicTh>
                  <ClassicTh>{t('Component')}</ClassicTh>
                  <ClassicTh>{t('PID')}</ClassicTh>
                  <ClassicTh>{t('Level')}</ClassicTh>
                  <ClassicTh className="w-full">{t('Message')}</ClassicTh>
                  <ClassicTh>{t('File')}</ClassicTh>
                  <ClassicTh numeric>{t('Line')}</ClassicTh>
                </tr>
              </ClassicThead>
              {/* Plain tbody: the striped ClassicTbody would paint over the level bands. */}
              <tbody>
                {logs.map((log) => <LogRow key={log.id} log={log} />)}
              </tbody>
            </ClassicTable>
          </QueryState>

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

function LogRow({ log }: { log: LogEntry }) {
  return (
    <tr className={levelBand(log.level)} data-level={log.level} data-testid={`log-row-${log.id}`}>
      <td className={clsx(cell, 'whitespace-nowrap')}>{formatLogTime(log.time_key)}</td>
      <td className={clsx(cell, 'whitespace-nowrap')}>{log.component}</td>
      <td className={clsx(cell, 'whitespace-nowrap tabular-nums')}>{log.pid ?? ''}</td>
      <td className={clsx(cell, 'whitespace-nowrap')} title={levelLabel(log.level)}>
        {log.code || levelLabel(log.level)}
      </td>
      <td className={clsx(cell, 'whitespace-pre-wrap break-words')}>{log.message}</td>
      <td className={clsx(cell, 'whitespace-nowrap')}>{log.file ?? ''}</td>
      <td className={clsx(cell, 'whitespace-nowrap text-end tabular-nums')}>{log.line ?? ''}</td>
    </tr>
  );
}

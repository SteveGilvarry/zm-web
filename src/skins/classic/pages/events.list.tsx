import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, RefreshCw, RotateCcw, Filter, Download } from 'lucide-react';
import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import { useDocumentTitle } from '@/skins/modern/layouts/useDocumentTitle';
import { BulkActionBar } from '@/features/events/BulkActionBar';
import { ClassicEventsTable } from '@/features/events/ClassicEventsTable';
import { ColumnChooser } from '@/features/events/ColumnChooser';
import { useEventsListPage, type ArchivedFilter } from '@/features/events/useEventsListPage';
import { ClassicButton, ClassicClearableInput, ClassicFilterField, ClassicPager } from '@/skins/classic/components/events/primitives';
import { classicSelect } from '@/skins/classic/components/events/styles';

/**
 * Events list — classic skin, laid out like legacy `?view=events`: the
 * filter form row (Group / Monitor / Start ≥ / Start ≤ / Notes / Tags /
 * Archive Status) with the action buttons on the end side, the
 * bootstrap-table toolbar (search, refresh, columns, export), the legacy
 * table and its footer pager. All state is in the URL.
 */
export default function ClassicEventsListPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('Events'));
  const s = useEventsListPage();

  if (!s.isAuthenticated) return null;

  const archivedOptions: Array<{ value: ArchivedFilter; label: string }> = [
    { value: 'all', label: t('All') },
    { value: 'unarchived', label: t('Unarchived Only') },
    { value: 'archived', label: t('Archived Only') },
  ];

  return (
    <AppShell title={t('Events')}>
      <main className="flex-1 overflow-auto bg-white text-zinc-900">
        {/* Filter form row */}
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-2 border-b border-[#dee2e6]">
          <div className="flex flex-wrap items-center gap-1.5 pt-4">
            <Link to="/" className="inline-flex items-center px-2.5 py-1.5 rounded-sm bg-[#e9ecef] border border-[#adb5bd] text-zinc-700" title={t('Back')} aria-label={t('Back')}>
              <ArrowLeft size={14} className="rtl:-scale-x-100" />
            </Link>
            <ClassicButton tone="primary" onClick={() => s.refetch()} title={t('Refresh')} aria-label={t('Refresh')}>
              <RefreshCw size={14} />
            </ClassicButton>
            <ClassicButton tone="primary" onClick={s.resetFilters} title={t('Reset filters')} aria-label={t('Reset filters')}>
              <RotateCcw size={14} />
            </ClassicButton>
            <Link
              to="/filters"
              search={s.filterLinkSearch}
              title={t('Save these conditions as a filter')}
              className="inline-flex items-center px-2.5 py-1.5 rounded-sm bg-[#337ab7] border border-[#2e6da4] text-white hover:bg-[#286090]"
            >
              <Filter size={14} />
            </Link>
          </div>

          <div className="flex flex-wrap items-end justify-center gap-3 flex-1">
            {s.groups.length > 0 && (
              <ClassicFilterField label={<>{t('Group')} <span className="text-zinc-500">=</span></>} htmlFor="ev-group">
                <select id="ev-group" value={s.groupFilter} onChange={(e) => s.setGroupFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))} className={clsx(classicSelect, 'w-36')}>
                  <option value="all">{t('All Groups')}</option>
                  {s.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </ClassicFilterField>
            )}
            <ClassicFilterField label={<>{t('Monitor')} <span className="text-zinc-500">=</span></>} htmlFor="ev-monitor">
              <select id="ev-monitor" value={s.monitorFilter} onChange={(e) => s.setMonitorFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))} className={clsx(classicSelect, 'w-40')}>
                <option value="all">{t('All Monitors')}</option>
                {s.monitors.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </ClassicFilterField>
            <ClassicFilterField label={<>{t('Start Date/Time')} <span className="text-zinc-500">&gt;=</span></>} htmlFor="ev-start">
              <ClassicClearableInput id="ev-start" type="datetime-local" value={s.dateInputValue} onChange={s.setDateInput} ariaLabel={t('Events starting after')} className="w-48" />
            </ClassicFilterField>
            <ClassicFilterField label={<>{t('Start Date/Time')} <span className="text-zinc-500">&lt;=</span></>} htmlFor="ev-end">
              <div title={t('The API bounds the end time, so an event still running at this instant is left out.')}>
                <ClassicClearableInput id="ev-end" type="datetime-local" value={s.endInputValue} onChange={s.setEndInput} ariaLabel={t('Events starting before')} className="w-48" />
              </div>
            </ClassicFilterField>
            <ClassicFilterField label={<>{t('Notes')} <span className="text-zinc-500">LIKE</span></>} htmlFor="ev-notes">
              <ClassicClearableInput id="ev-notes" value={s.notesQuery} onChange={s.setNotesQuery} placeholder={t('Event Type')} className="w-36" />
            </ClassicFilterField>
            <ClassicFilterField label={<>{t('Tags')} <span className="text-zinc-500">=</span></>} htmlFor="ev-tag">
              <select id="ev-tag" value={s.tagFilter} onChange={(e) => s.setTagFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))} className={clsx(classicSelect, 'w-36')}>
                <option value="all">{t('All Tags')}</option>
                {s.tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
              </select>
            </ClassicFilterField>
            <ClassicFilterField label={<>{t('Archive Status')} <span className="text-zinc-500">=</span></>} htmlFor="ev-archived">
              <select id="ev-archived" value={s.archivedFilter} onChange={(e) => s.setArchivedFilter(e.target.value as ArchivedFilter)} className={clsx(classicSelect, 'w-36')}>
                {archivedOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </ClassicFilterField>
          </div>

          <div className="pt-4">
            <BulkActionBar variant="classic" selectedIds={s.selectedIds} onClear={s.clearSelection} />
          </div>
        </div>

        {s.showDefaultHourHint && (
          <p role="status" data-testid="default-hour-hint" className="px-4 py-1 text-xs text-[#856404] bg-[#fff3cd] border-b border-[#ffeeba]">
            {t('Showing events from the last hour only')}{' '}
            <button type="button" onClick={s.clearDefaultDateFilter} className="underline">{t('Clear')}</button>
          </p>
        )}

        {/* bootstrap-table toolbar */}
        <div className="flex flex-wrap items-center justify-end gap-1.5 px-4 py-2">
          {s.pageLocalFiltering && (
            <span className="me-auto text-xs text-[#856404]">
              {t('(search, cause, notes and tag apply within this page: {{shown}} of {{rows}} rows)', { shown: s.events.length, rows: s.pageRowCount })}
            </span>
          )}
          <input
            type="search"
            value={s.searchQuery}
            onChange={(e) => s.setSearchQuery(e.target.value)}
            placeholder={t('Search')}
            aria-label={t('Search events')}
            className="px-2 py-1 text-sm border border-[#ced4da] rounded-sm w-48 focus:outline-none focus:border-[#80bdff]"
          />
          <ClassicButton tone="primary" onClick={() => s.refetch()} aria-label={t('Refresh events')} title={t('Refresh')}>
            <RefreshCw size={14} className={s.isFetching ? 'animate-spin' : undefined} />
          </ClassicButton>
          <ColumnChooser variant="classic" />
          <ClassicButton tone="primary" onClick={s.exportCsv} disabled={s.events.length === 0} aria-label={t('Export visible events as CSV')} title={t('Export visible events as CSV')}>
            <Download size={14} />
          </ClassicButton>
        </div>

        <div className="px-4 pb-4">
          <QueryState isLoading={s.isLoading} isError={!!s.error} error={s.error} onRetry={s.refetch}>
            <ClassicEventsTable
              events={s.events}
              monitorLookup={s.monitorLookup}
              storageName={s.storageName}
              selectedIds={s.selectedIds}
              onToggleSelected={s.toggleSelected}
              onSetSelected={s.setSelected}
              token={s.accessToken}
              sortField={s.sortField}
              sortDir={s.sortDir}
              onSort={s.toggleSort}
              showThumbs={s.showThumbs}
              thumbWidth={s.thumbWidth}
            />
            <ClassicPager
              page={s.page}
              pageSize={s.pageSize}
              total={s.total}
              totalPages={s.totalPages}
              pageSizeOptions={s.pageSizeOptions}
              onPage={s.setPage}
              onPageSize={s.setPageSize}
              shown={s.pageRowCount}
            />
          </QueryState>
        </div>
      </main>
    </AppShell>
  );
}

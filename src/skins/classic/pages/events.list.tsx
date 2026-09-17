import { useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, RefreshCw, RotateCcw, Filter, FilterX, Download, Maximize2, List, X,
} from 'lucide-react';
import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import { useDocumentTitle } from '@/skins/modern/layouts/useDocumentTitle';
import { BulkActionBar } from '@/features/events/BulkActionBar';
import { ClassicEventsTable } from '@/features/events/ClassicEventsTable';
import { ColumnChooser } from '@/features/events/ColumnChooser';
import {
  useEventsListPage, EVENTS_PAGE_SIZE_MAX, type ArchivedFilter,
} from '@/features/events/useEventsListPage';
import { useNoteTypeOptions } from '@/features/events/noteTypes';
import { useCanGoBack } from '@/features/nav/useCanGoBack';
import { useUiStore } from '@/stores/ui';
import { ClassicButton, ClassicClearableInput, ClassicFilterField, ClassicPager } from '@/skins/classic/components/events/primitives';
import { classicSelect } from '@/skins/classic/components/events/styles';

/**
 * Events list — classic skin, laid out like legacy `?view=events`: the
 * filter form row (Group / Monitor / Start ≥ / Start ≤ / Cause / Notes /
 * Tags / Archive Status) with the action buttons on the end side, the
 * bootstrap-table toolbar (name search, refresh, columns, export), the
 * legacy table and its footer pager. Every filter is a query param on
 * `/events`; all state is in the URL.
 */
export default function ClassicEventsListPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('Events'));
  const s = useEventsListPage();
  const noteTypes = useNoteTypeOptions();
  // `fbflip`: the filter strip's own show/hide, remembered like the cookie
  // legacy keeps it in.
  const filterBarOpen = useUiStore((st) => st.classicEventsFilterBarOpen);
  const toggleFilterBar = useUiStore((st) => st.toggleClassicEventsFilterBar);
  // bootstrap-table's fullscreen and pagination-switch toolbar buttons.
  const tableRef = useRef<HTMLDivElement>(null);
  const [paginated, setPaginated] = useState(true);
  const pagedSize = useRef(s.pageSize);
  const togglePagination = () => {
    if (paginated) {
      pagedSize.current = s.pageSize;
      s.setPageSize(EVENTS_PAGE_SIZE_MAX);
      setPaginated(false);
    } else {
      s.setPageSize(pagedSize.current);
      setPaginated(true);
    }
  };
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void tableRef.current?.requestFullscreen?.();
  };
  // Legacy disables Back when there is no page to go back to.
  const canGoBack = useCanGoBack();

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
            <ClassicButton
              onClick={() => window.history.back()}
              disabled={!canGoBack}
              title={t('Back')}
              aria-label={t('Back')}
            >
              <ArrowLeft size={14} className="rtl:-scale-x-100" />
            </ClassicButton>
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
            <ClassicButton
              onClick={toggleFilterBar}
              aria-pressed={filterBarOpen}
              title={filterBarOpen ? t('Hide filter bar') : t('Show filter bar')}
              aria-label={filterBarOpen ? t('Hide filter bar') : t('Show filter bar')}
            >
              {filterBarOpen ? <FilterX size={14} /> : <Filter size={14} />}
            </ClassicButton>
          </div>

          <div
            data-testid="events-filter-bar"
            className={clsx('flex-wrap items-end justify-center gap-3 flex-1', filterBarOpen ? 'flex' : 'hidden')}
          >
            {s.groups.length > 0 && (
              <ClassicFilterField label={<>{t('Group')} <span className="text-zinc-500">=</span></>} htmlFor="ev-group">
                <div className="flex items-center gap-1">
                  <select id="ev-group" value={s.groupFilter} onChange={(e) => s.setGroupFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))} className={clsx(classicSelect, 'w-36')}>
                    <option value="all">{t('All Groups')}</option>
                    {s.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                  <TermClearButton label={t('Group')} onClear={() => s.setGroupFilter('all')} disabled={s.groupFilter === 'all'} />
                </div>
              </ClassicFilterField>
            )}
            <ClassicFilterField label={<>{t('Monitor')} <span className="text-zinc-500">=</span></>} htmlFor="ev-monitor">
              {/* Legacy: a chosen multi-select whose placeholder reads "All Monitors"; nothing selected means every monitor. */}
              <div className="flex items-start gap-1">
                <select
                  id="ev-monitor"
                  multiple
                  size={3}
                  title={t('All Monitors')}
                  value={s.monitorFilter.map(String)}
                  onChange={(e) => s.setMonitorFilter(Array.from(e.target.selectedOptions, (o) => Number(o.value)))}
                  className={clsx(classicSelect, 'w-40')}
                >
                  {s.monitors.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <TermClearButton label={t('Monitor')} onClear={() => s.setMonitorFilter([])} disabled={s.monitorFilter.length === 0} />
              </div>
            </ClassicFilterField>
            <ClassicFilterField label={<>{t('Start Date/Time')} <span className="text-zinc-500">&gt;=</span></>} htmlFor="ev-start">
              <ClassicClearableInput id="ev-start" type="datetime-local" value={s.dateInputValue} onChange={s.setDateInput} ariaLabel={t('Events starting after')} className="w-48" />
            </ClassicFilterField>
            <ClassicFilterField label={<>{t('Start Date/Time')} <span className="text-zinc-500">&lt;=</span></>} htmlFor="ev-end">
              <div title={t('The API bounds the end time, so an event still running at this instant is left out.')}>
                <ClassicClearableInput id="ev-end" type="datetime-local" value={s.endInputValue} onChange={s.setEndInput} ariaLabel={t('Events starting before')} className="w-48" />
              </div>
            </ClassicFilterField>
            <ClassicFilterField label={<>{t('Cause')} <span className="text-zinc-500">LIKE</span></>} htmlFor="ev-cause">
              <ClassicClearableInput id="ev-cause" value={s.causeFilter} onChange={s.setCauseFilter} ariaLabel={t('Cause')} list="ev-cause-suggestions" className="w-36" />
              <datalist id="ev-cause-suggestions">
                {s.causes.map((cause) => <option key={cause} value={cause} />)}
              </datalist>
            </ClassicFilterField>
            <ClassicFilterField label={<>{t('Notes')} <span className="text-zinc-500">LIKE</span></>} htmlFor="ev-notes">
              {/* Legacy's Notes box is a fixed multi-select of event types,
                  each ORed as `Notes LIKE %type%` (Filter.php:1380-1400). */}
              <div className="flex items-start gap-1">
                <select
                  id="ev-notes"
                  multiple
                  size={3}
                  title={t('Event Type')}
                  value={s.notesFilter}
                  onChange={(e) => s.setNotesFilter(Array.from(e.target.selectedOptions, (o) => o.value))}
                  className={clsx(classicSelect, 'w-36')}
                >
                  {noteTypes.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <TermClearButton label={t('Notes')} onClear={() => s.setNotesFilter([])} disabled={s.notesFilter.length === 0} />
              </div>
            </ClassicFilterField>
            <ClassicFilterField label={<>{t('Tags')} <span className="text-zinc-500">=</span></>} htmlFor="ev-tag">
              <div className="flex items-center gap-1">
                <select id="ev-tag" value={s.tagFilter} onChange={(e) => s.setTagFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))} className={clsx(classicSelect, 'w-36')}>
                  <option value="all">{t('All Tags')}</option>
                  {s.tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
                </select>
                <TermClearButton label={t('Tags')} onClear={() => s.setTagFilter('all')} disabled={s.tagFilter === 'all'} />
              </div>
            </ClassicFilterField>
            <ClassicFilterField label={<>{t('Archive Status')} <span className="text-zinc-500">=</span></>} htmlFor="ev-archived">
              <select id="ev-archived" value={s.archivedFilter} onChange={(e) => s.setArchivedFilter(e.target.value as ArchivedFilter)} className={clsx(classicSelect, 'w-36')}>
                {archivedOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </ClassicFilterField>
          </div>

          <div className="pt-4">
            <BulkActionBar variant="classic" selectedIds={s.selectedIds} events={s.events} onClear={s.clearSelection} />
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
          <input
            type="search"
            value={s.searchQuery}
            onChange={(e) => s.setSearchQuery(e.target.value)}
            placeholder={t('Name contains…')}
            aria-label={t('Name contains')}
            className="px-2 py-1 text-sm border border-[#ced4da] rounded-sm w-48 focus:outline-none focus:border-[#80bdff]"
          />
          <ClassicButton tone="primary" onClick={() => s.refetch()} aria-label={t('Refresh events')} title={t('Refresh')}>
            <RefreshCw size={14} className={s.isFetching ? 'animate-spin' : undefined} />
          </ClassicButton>
          <ColumnChooser variant="classic" />
          <ClassicButton tone="primary" onClick={s.exportCsv} disabled={s.events.length === 0} aria-label={t('Export visible events as CSV')} title={t('Export visible events as CSV')}>
            <Download size={14} />
          </ClassicButton>
          {/* bootstrap-table's pagination switch: off shows the whole
              result in one go (capped at the API's page-size ceiling). */}
          <ClassicButton
            tone="primary"
            onClick={togglePagination}
            aria-pressed={!paginated}
            aria-label={paginated ? t('Hide pagination') : t('Show pagination')}
            title={paginated ? t('Hide pagination') : t('Show pagination')}
          >
            <List size={14} />
          </ClassicButton>
          <ClassicButton tone="primary" onClick={toggleFullscreen} aria-label={t('Toggle fullscreen')} title={t('Toggle fullscreen')}>
            <Maximize2 size={14} />
          </ClassicButton>
        </div>

        <div className="px-4 pb-4 bg-white" ref={tableRef}>
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
              detailSearch={s.detailSearch}
            />
            {paginated && (
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
            )}
          </QueryState>
        </div>
      </main>
    </AppShell>
  );
}

/**
 * Legacy's `btn-term-remove-all` (Filter.php:1516): a clear button beside
 * each filter select that empties just that term.
 */
function TermClearButton({ label, onClear, disabled }: {
  label: string; onClear: () => void; disabled: boolean;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClear}
      disabled={disabled}
      aria-label={t('Clear {{field}}', { field: label })}
      title={t('Clear {{field}}', { field: label })}
      className="p-1 text-zinc-500 hover:text-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <X size={12} aria-hidden />
    </button>
  );
}

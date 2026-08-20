import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import {
  Search,
  Filter,
  RefreshCw,
  Calendar,
  Clock,
  Monitor,
  ChevronLeft,
  ChevronRight,
  Tag as TagIcon,
  X,
  Download,
  Layers,
  FilterX,
} from 'lucide-react';
import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import { useDocumentTitle } from '../layouts/useDocumentTitle';
import { BulkActionBar } from '@/features/events/BulkActionBar';
import { ColumnChooser } from '@/features/events/ColumnChooser';
import { EventsSortBar } from '@/features/events/EventsSortBar';
import { formatBytes } from '@/lib/format';
import { formatDuration } from '@/features/events/duration';
import { useEventsListPage } from '@/features/events/useEventsListPage';
import { EventCard } from '../components/EventCard';

const field = clsx(
  'bg-surface border border-border-subtle rounded-lg',
  'text-text-primary placeholder:text-text-muted',
  'focus:outline-none focus:border-cyan/50 transition-colors',
);
const toolBtn = 'p-2 rounded-lg bg-surface border border-border-subtle text-text-muted hover:text-text-primary hover:border-cyan/50 transition-colors disabled:opacity-50';

/**
 * Events list — Mission Control. Filter toolbar (group, monitor, cause,
 * start ≥ / ≤, notes, tag, archived), last-hour hint, totals, card list,
 * bulk bar and pagination. Every filter lives in the URL.
 */
export default function EventsListPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('Events'));
  const state = useEventsListPage();
  const {
    isAuthenticated, isLoading, error, refetch, accessToken,
    events, total, monitors, groups, tags, causes, totals, pageLocalFiltering, pageRowCount,
    searchQuery, setSearchQuery, notesQuery, setNotesQuery,
    monitorFilter, setMonitorFilter, groupFilter, setGroupFilter,
    causeFilter, setCauseFilter, tagFilter, setTagFilter,
    archivedFilter, setArchivedFilter,
    dateInputValue, setDateInput, endInputValue, setEndInput,
    showDefaultHourHint, clearDefaultDateFilter, resetFilters,
    sortField, sortDir, toggleSort,
    page, pageSize, pageSizeOptions, setPageSize, totalPages, setPage, prevPage, nextPage,
    selectedIds, toggleSelected, clearSelection, showThumbs, monitorLookup,
    filterLinkSearch, exportCsv,
  } = state;

  const archivedLabel = {
    all: t('All'),
    unarchived: t('Unarchived'),
    archived: t('Archived'),
  } as const;

  if (!isAuthenticated) return null;

  return (
    <AppShell title={t('Events')}>
      <main className="flex-1 p-6 overflow-auto">
        {/* Toolbar */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                type="text"
                placeholder={t('Search events...')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={clsx(field, 'ps-10 pe-4 py-2 w-56')}
              />
            </div>

            {groups.length > 0 && (
              <div className="relative">
                <select
                  aria-label={t('Group')}
                  value={groupFilter}
                  onChange={(e) => setGroupFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                  className={clsx(field, 'ps-3 pe-8 py-2 appearance-none cursor-pointer')}
                >
                  <option value="all">{t('All Groups')}</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
                <Layers className="absolute end-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
              </div>
            )}

            <div className="relative">
              <select
                aria-label={t('Monitor')}
                value={monitorFilter}
                onChange={(e) => setMonitorFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                className={clsx(field, 'ps-3 pe-8 py-2 appearance-none cursor-pointer')}
              >
                <option value="all">{t('All Monitors')}</option>
                {monitors.map((monitor) => (
                  <option key={monitor.id} value={monitor.id}>{monitor.name}</option>
                ))}
              </select>
              <Monitor className="absolute end-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
            </div>

            <div className="relative">
              <select
                aria-label={t('Cause')}
                value={causeFilter}
                onChange={(e) => setCauseFilter(e.target.value)}
                className={clsx(field, 'ps-3 pe-8 py-2 appearance-none cursor-pointer')}
              >
                <option value="all">{t('All Causes')}</option>
                {causes.map((cause) => (
                  <option key={cause} value={cause}>{cause}</option>
                ))}
              </select>
              <Filter className="absolute end-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
            </div>

            {/* Start ≥ / Start ≤ — local wall-clock datetimes */}
            <div className="relative">
              <Calendar className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
              <input
                type="datetime-local"
                aria-label={t('Events starting after')}
                value={dateInputValue}
                onChange={(e) => setDateInput(e.target.value)}
                className={clsx(field, 'ps-10 pe-3 py-2')}
              />
            </div>
            <input
              type="datetime-local"
              aria-label={t('Events starting before')}
              title={t('The API bounds the end time, so an event still running at this instant is left out.')}
              value={endInputValue}
              onChange={(e) => setEndInput(e.target.value)}
              className={clsx(field, 'px-3 py-2')}
            />

            <input
              type="text"
              placeholder={t('Notes contain…')}
              value={notesQuery}
              onChange={(e) => setNotesQuery(e.target.value)}
              className={clsx(field, 'px-3 py-2 w-40 text-sm')}
            />

            <div className="relative">
              <select
                aria-label={t('Tag')}
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                className={clsx(field, 'ps-3 pe-8 py-2 appearance-none cursor-pointer')}
              >
                <option value="all">{t('All Tags')}</option>
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                    {tag.event_count != null ? ` (${tag.event_count})` : ''}
                  </option>
                ))}
              </select>
              <TagIcon className="absolute end-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
            </div>

            <div className="flex items-center gap-1 p-1 bg-surface border border-border-subtle rounded-lg">
              {(['all', 'unarchived', 'archived'] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setArchivedFilter(status)}
                  className={clsx(
                    'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                    archivedFilter === status ? 'bg-cyan/20 text-cyan' : 'text-text-muted hover:text-text-primary',
                  )}
                >
                  {archivedLabel[status]}
                </button>
              ))}
            </div>

            <button type="button" onClick={resetFilters} className={toolBtn} aria-label={t('Reset filters')} title={t('Reset filters')}>
              <FilterX className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <label className="flex items-center gap-1.5 text-xs text-text-muted">
              <span className="font-mono uppercase tracking-[0.16em]">{t('Per page')}</span>
              <select
                aria-label={t('Events per page')}
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className={clsx(field, 'px-2 py-2 text-sm')}
              >
                {pageSizeOptions.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>

            <ColumnChooser variant="modern" />

            {/* Legacy "Filter" — open a new saved filter seeded with these terms */}
            <Link
              to="/filters"
              search={filterLinkSearch}
              className={clsx(toolBtn, 'inline-flex items-center gap-1.5 text-sm')}
              title={t('Save these conditions as a filter')}
            >
              <Filter className="w-4 h-4" />
              {t('Filter')}
            </Link>

            <button type="button" onClick={exportCsv} disabled={events.length === 0} className={toolBtn} aria-label={t('Export visible events as CSV')} title={t('Export visible events as CSV')}>
              <Download className="w-4 h-4" />
            </button>

            <button type="button" onClick={() => refetch()} className={toolBtn} aria-label={t('Refresh events')}>
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {showDefaultHourHint && (
          <div
            role="status"
            data-testid="default-hour-hint"
            className="mb-4 flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-amber/40 bg-amber/10 text-amber text-sm"
          >
            <span className="flex items-center gap-2">
              <Clock size={14} />
              {t('Showing events from the last hour only')}
            </span>
            <button
              type="button"
              onClick={clearDefaultDateFilter}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs hover:bg-amber/20 transition-colors"
            >
              <X size={12} />
              {t('Clear')}
            </button>
          </div>
        )}

        <div className="mb-4 flex items-center justify-between text-sm text-text-muted">
          <span>
            {t('Showing {{shown}} of {{total}} events', { shown: events.length, total })}
            {pageLocalFiltering && (
              <span className="ms-2 text-xs text-amber">
                {t('(search, cause, notes and tag apply within this page: {{shown}} of {{rows}} rows)', { shown: events.length, rows: pageRowCount })}
              </span>
            )}
          </span>
          {events.length > 0 && (
            <span className="flex items-center gap-3 font-mono text-xs">
              <span data-testid="modern-total-duration">
                {t('Σ Duration {{duration}}', { duration: formatDuration(totals.duration) })}
              </span>
              <span data-testid="modern-total-disk">
                {t('Σ Disk {{size}}', { size: formatBytes(totals.disk) })}
              </span>
            </span>
          )}
        </div>

        <EventsSortBar sortField={sortField} sortDir={sortDir} onToggle={toggleSort} />

        <QueryState
          isLoading={isLoading}
          isError={!!error}
          error={error}
          onRetry={refetch}
          empty={events.length === 0}
          emptyMessage={t('No events found')}
          emptyAction={<p className="text-xs text-text-muted">{t('Try adjusting your filters')}</p>}
        >
          <div className="space-y-3 stagger-children">
            {events.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                monitorName={monitorLookup[event.monitor_id] || t('Monitor {{id}}', { id: event.monitor_id })}
                token={accessToken}
                isSelected={selectedIds.has(event.id)}
                onToggleSelected={() => toggleSelected(event.id)}
                showThumbnail={showThumbs}
              />
            ))}
          </div>
        </QueryState>

        <BulkActionBar selectedIds={selectedIds} onClear={clearSelection} />

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <button
              onClick={prevPage}
              disabled={page === 1}
              aria-label={t('Previous page')}
              className={clsx('p-2 rounded-lg border bg-surface border-border-subtle transition-colors', page === 1 ? 'text-text-muted cursor-not-allowed' : 'text-text-primary hover:border-cyan/50')}
            >
              <ChevronLeft className="w-4 h-4 rtl:-scale-x-100" />
            </button>

            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5 || page <= 3) pageNum = i + 1;
                else if (page >= totalPages - 2) pageNum = totalPages - 4 + i;
                else pageNum = page - 2 + i;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    aria-label={t('Go to page {{page}}', { page: pageNum })}
                    aria-current={page === pageNum ? 'page' : undefined}
                    className={clsx(
                      'w-8 h-8 rounded-lg text-sm font-medium transition-colors',
                      page === pageNum
                        ? 'bg-cyan text-void'
                        : 'bg-surface border border-border-subtle text-text-secondary hover:text-text-primary hover:border-cyan/50',
                    )}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <button
              onClick={nextPage}
              disabled={page === totalPages}
              aria-label={t('Next page')}
              className={clsx('p-2 rounded-lg border bg-surface border-border-subtle transition-colors', page === totalPages ? 'text-text-muted cursor-not-allowed' : 'text-text-primary hover:border-cyan/50')}
            >
              <ChevronRight className="w-4 h-4 rtl:-scale-x-100" />
            </button>

            <JumpToPage page={page} totalPages={totalPages} onJump={setPage} />
          </div>
        )}
      </main>
    </AppShell>
  );
}

/**
 * Numeric jump-to-page input. Submits on Enter or button press; ignores any
 * value outside `1..totalPages`. Internal value resets to the current page
 * whenever the parent navigates so the input always reflects reality.
 */
function JumpToPage({ page, totalPages, onJump }: { page: number; totalPages: number; onJump: (n: number) => void }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(String(page));
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { setValue(String(page)); }, [page]);

  const submit = () => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > totalPages) {
      setValue(String(page));
      return;
    }
    if (n !== page) onJump(n);
  };

  return (
    <form
      role="search"
      aria-label={t('Jump to page')}
      onSubmit={(e) => { e.preventDefault(); submit(); }}
      className="flex items-center gap-1 ms-2"
    >
      <span className="text-xs text-text-muted">{t('Page')}</span>
      <input
        ref={inputRef}
        type="number"
        inputMode="numeric"
        min={1}
        max={totalPages}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={submit}
        aria-label={t('Jump to page')}
        className={clsx(
          field,
          'w-14 px-2 py-1 rounded text-sm text-center font-mono',
          '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
        )}
      />
      <span className="text-xs text-text-muted">{t('of {{total}}', { total: totalPages })}</span>
      <button type="submit" className="px-2 py-1 rounded text-xs text-cyan border border-cyan/40 hover:bg-cyan/15 transition-colors">
        {t('Go')}
      </button>
    </form>
  );
}

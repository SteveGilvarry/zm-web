import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import {
  Search,
  Filter,
  RefreshCw,
  Clock,
  ChevronLeft,
  ChevronRight,
  X,
  Download,
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
import { EventsTable } from '../components/EventsTable';
import { ToolbarDisclosure } from '../components/ToolbarDisclosure';
import { useEventsColumnsStore } from '@/stores/eventsColumns';

const field = clsx(
  'bg-surface border border-border-subtle rounded',
  'text-fg placeholder:text-fg-faint',
  'focus:outline-none focus:border-accent transition-colors',
);
const toolBtn = 'p-1.5 rounded text-fg-dim hover:text-fg hover:bg-surface-2 transition-colors disabled:opacity-50';

/**
 * Events list — the modern skin.
 *
 * An operator arrives here to scan: the table is the page, and it starts at
 * the top of the viewport rather than below three rows of controls. The
 * query line above it holds the two filters used on nearly every visit
 * (name, monitor) plus the archive switch; the other seven live behind
 * Filters, which counts how many are narrowing the list (docs/DESIGN.md).
 */
export default function EventsListPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('Events'));
  const state = useEventsListPage();
  const {
    isAuthenticated, isLoading, error, refetch, accessToken,
    events, total, monitors, groups, tags, causes, totals,
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
  const view = useEventsColumnsStore((st) => st.view);
  const setView = useEventsColumnsStore((st) => st.setView);

  const archivedLabel = {
    all: t('All'),
    unarchived: t('Unarchived'),
    archived: t('Archived'),
  } as const;

  if (!isAuthenticated) return null;

  // What is actually narrowing the list right now — the number the Filters
  // button shows, so a filter set from a deep link is never invisible.
  const activeFilters = [
    groupFilter !== 'all', causeFilter !== '', dateInputValue !== '',
    endInputValue !== '', notesQuery !== '', tagFilter !== 'all',
  ].filter(Boolean).length;

  return (
    <AppShell title={t('Events')}>
      <main className="flex-1 min-h-0 flex flex-col">
        {/* The query line: everything you change often, in one row. */}
        <div className="flex items-center gap-2 px-3 h-11 shrink-0 border-b border-border-subtle bg-surface">
          <div className="relative">
            <Search className="absolute start-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-fg-faint" aria-hidden />
            <input
              type="text"
              aria-label={t('Name contains')}
              placeholder={t('Name contains…')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={clsx(field, 'ps-7 pe-2 py-1 w-44 text-sm')}
            />
          </div>

          <select
            aria-label={t('Monitor')}
            value={monitorFilter}
            onChange={(e) => setMonitorFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
            className={clsx(field, 'px-2 py-1 text-sm cursor-pointer')}
          >
            <option value="all">{t('All Monitors')}</option>
            {monitors.map((monitor) => (
              <option key={monitor.id} value={monitor.id}>{monitor.name}</option>
            ))}
          </select>

          <div role="group" aria-label={t('Archive state')} className="shrink-0 flex items-center gap-0.5 rounded border border-border-subtle p-0.5">
            {(['all', 'unarchived', 'archived'] as const).map((status) => (
              <button
                key={status}
                type="button"
                aria-pressed={archivedFilter === status}
                onClick={() => setArchivedFilter(status)}
                className={clsx(
                  'px-2 py-0.5 rounded text-xs transition-colors',
                  archivedFilter === status ? 'bg-accent/15 text-accent' : 'text-fg-dim hover:text-fg',
                )}
              >
                {archivedLabel[status]}
              </button>
            ))}
          </div>

          <ToolbarDisclosure label={t('Filters')} icon={Filter} count={activeFilters}>
            <div className="grid grid-cols-2 gap-3">
              {groups.length > 0 && (
                <label className="flex flex-col gap-1 text-xs text-fg-dim">
                  {t('Group')}
                  <select
                    aria-label={t('Group')}
                    value={groupFilter}
                    onChange={(e) => setGroupFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                    className={clsx(field, 'px-2 py-1 text-sm cursor-pointer')}
                  >
                    <option value="all">{t('All Groups')}</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </label>
              )}

              {/* Substring match, server-side. The datalist only suggests the
                  causes on this page — the API has no distinct-values route. */}
              <label className="flex flex-col gap-1 text-xs text-fg-dim">
                {t('Cause')}
                <input
                  type="text"
                  list="events-cause-suggestions"
                  aria-label={t('Cause')}
                  placeholder={t('Cause contains…')}
                  value={causeFilter}
                  onChange={(e) => setCauseFilter(e.target.value)}
                  className={clsx(field, 'px-2 py-1 text-sm')}
                />
                <datalist id="events-cause-suggestions">
                  {causes.map((cause) => <option key={cause} value={cause} />)}
                </datalist>
              </label>

              <label className="flex flex-col gap-1 text-xs text-fg-dim">
                {t('Events starting after')}
                <input
                  type="datetime-local"
                  aria-label={t('Events starting after')}
                  value={dateInputValue}
                  onChange={(e) => setDateInput(e.target.value)}
                  className={clsx(field, 'px-2 py-1 text-sm')}
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-fg-dim">
                {t('Events starting before')}
                <input
                  type="datetime-local"
                  aria-label={t('Events starting before')}
                  title={t('The API bounds the end time, so an event still running at this instant is left out.')}
                  value={endInputValue}
                  onChange={(e) => setEndInput(e.target.value)}
                  className={clsx(field, 'px-2 py-1 text-sm')}
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-fg-dim">
                {t('Notes contain')}
                <input
                  type="text"
                  aria-label={t('Notes contain')}
                  placeholder={t('Notes contain…')}
                  value={notesQuery}
                  onChange={(e) => setNotesQuery(e.target.value)}
                  className={clsx(field, 'px-2 py-1 text-sm')}
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-fg-dim">
                {t('Tag')}
                <select
                  aria-label={t('Tag')}
                  value={tagFilter}
                  onChange={(e) => setTagFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                  className={clsx(field, 'px-2 py-1 text-sm cursor-pointer')}
                >
                  <option value="all">{t('All Tags')}</option>
                  {tags.map((tag) => (
                    <option key={tag.id} value={tag.id}>
                      {tag.name}
                      {tag.event_count != null ? ` (${tag.event_count})` : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-3 pt-3 border-t border-border-subtle flex items-center justify-between">
              <Link
                to="/filters"
                search={filterLinkSearch}
                className="text-xs text-accent hover:underline"
                title={t('Save these conditions as a filter')}
              >
                {t('Save these conditions as a filter')}
              </Link>
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 text-xs text-fg-dim hover:text-fg transition-colors"
              >
                <FilterX className="w-3.5 h-3.5" aria-hidden />
                {t('Reset filters')}
              </button>
            </div>
          </ToolbarDisclosure>

          <span className="ms-auto" />

          <div role="group" aria-label={t('List layout')} className="shrink-0 flex items-center gap-0.5 rounded border border-border-subtle p-0.5">
            {(['table', 'cards'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={view === mode}
                onClick={() => setView(mode)}
                className={clsx(
                  'px-2 py-0.5 rounded text-xs transition-colors',
                  view === mode ? 'bg-accent/15 text-accent' : 'text-fg-dim hover:text-fg',
                )}
              >
                {mode === 'table' ? t('Table') : t('Cards')}
              </button>
            ))}
          </div>

          <ColumnChooser variant="modern" />

          <label className="shrink-0 flex items-center gap-1 text-xs text-fg-dim">
            {t('Per page')}
            <select
              aria-label={t('Events per page')}
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className={clsx(field, 'px-1 py-0.5 text-xs cursor-pointer')}
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>

          <button type="button" onClick={exportCsv} disabled={events.length === 0} className={toolBtn} aria-label={t('Export visible events as CSV')} title={t('Export visible events as CSV')}>
            <Download className="w-4 h-4" />
          </button>

          <button type="button" onClick={() => refetch()} className={toolBtn} aria-label={t('Refresh events')}>
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {showDefaultHourHint && (
          <div
            role="status"
            data-testid="default-hour-hint"
            className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-border-subtle bg-warn/10 text-warn text-sm"
          >
            <span className="flex items-center gap-2">
              <Clock size={14} aria-hidden />
              {t('Showing events from the last hour only')}
            </span>
            <button
              type="button"
              onClick={clearDefaultDateFilter}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs hover:bg-warn/20 transition-colors"
            >
              <X size={12} />
              {t('Clear')}
            </button>
          </div>
        )}

        {/* The list is the page: it owns the remaining height and scrolls
            inside itself, so the query line and the pager stay put. */}
        <div className="flex-1 min-h-0 overflow-auto p-3">
          {view === 'cards' && (
            <div className="mb-3">
              <EventsSortBar sortField={sortField} sortDir={sortDir} onToggle={toggleSort} />
            </div>
          )}
        <QueryState
          isLoading={isLoading}
          isError={!!error}
          error={error}
          onRetry={refetch}
          empty={events.length === 0}
          emptyMessage={t('No events found')}
          emptyAction={<p className="text-xs text-fg-dim">{t('Try adjusting your filters')}</p>}
        >
          {view === 'table' ? (
            <EventsTable
              events={events}
              monitorName={(id) => monitorLookup[id] || t('Monitor {{id}}', { id })}
              token={accessToken ?? undefined}
              selectedIds={selectedIds}
              onToggleSelected={toggleSelected}
              onToggleAll={() => {
                const all = events.every((e) => selectedIds.has(e.id));
                if (all) clearSelection();
                else events.forEach((e) => { if (!selectedIds.has(e.id)) toggleSelected(e.id); });
              }}
              showThumbnail={showThumbs}
              sortField={sortField}
              sortDir={sortDir}
              onSort={toggleSort}
            />
          ) : (
            <div className="space-y-3">
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
          )}
        </QueryState>
        </div>

        <BulkActionBar selectedIds={selectedIds} onClear={clearSelection} />

        {/* Status bar: what this page is showing, and how to leave it. */}
        <div className="flex items-center gap-3 px-3 py-2 shrink-0 border-t border-border-subtle bg-surface text-xs text-fg-dim">
          <span>{t('Showing {{shown}} of {{total}} events', { shown: events.length, total })}</span>
          {events.length > 0 && (
            <>
              <span data-testid="modern-total-duration" className="font-mono tabular-nums">
                {t('Σ Duration {{duration}}', { duration: formatDuration(totals.duration) })}
              </span>
              <span data-testid="modern-total-disk" className="font-mono tabular-nums">
                {t('Σ Disk {{size}}', { size: formatBytes(totals.disk) })}
              </span>
            </>
          )}
          <div className="ms-auto flex items-center gap-2">
          {totalPages > 1 && (
            <>
            <button
              onClick={prevPage}
              disabled={page === 1}
              aria-label={t('Previous page')}
              className={clsx('p-1.5 rounded border border-border-subtle transition-colors', page === 1 ? 'text-fg-faint cursor-not-allowed' : 'text-fg hover:border-accent')}
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
                      'w-7 h-7 rounded text-sm tabular-nums transition-colors',
                      page === pageNum
                        ? 'bg-accent text-accent-fg'
                        : 'border border-border-subtle text-fg-muted hover:text-fg hover:border-accent',
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
              className={clsx('p-1.5 rounded border border-border-subtle transition-colors', page === totalPages ? 'text-fg-faint cursor-not-allowed' : 'text-fg hover:border-accent')}
            >
              <ChevronRight className="w-4 h-4 rtl:-scale-x-100" />
            </button>

            <JumpToPage page={page} totalPages={totalPages} onJump={setPage} />
            </>
          )}
          </div>
        </div>
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

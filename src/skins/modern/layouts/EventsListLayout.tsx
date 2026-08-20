import { useEffect, useRef, useState, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import {
  Video,
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
} from 'lucide-react';
import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { useDocumentTitle } from './useDocumentTitle';
import { BulkActionBar } from '@/features/events/BulkActionBar';
import { ColumnChooser } from '@/features/events/ColumnChooser';
import { formatBytes } from '@/lib/format';
import { formatDuration } from '@/features/events/duration';
import {
  useEventsListPage,
  type EventsListPageState,
} from '@/features/events/useEventsListPage';

/**
 * Events list — Mission Control layout. Filter toolbar, last-hour hint,
 * totals, bulk-action bar and pagination. The list body is pluggable so the
 * classic skin can drop its dense table into the same chrome.
 */
export function EventsListLayout({
  columnChooserVariant,
  renderList,
}: {
  columnChooserVariant: 'modern' | 'classic';
  renderList: (state: EventsListPageState) => ReactNode;
}) {
  const { t } = useTranslation();
  useDocumentTitle(t('Events'));
  const state = useEventsListPage();
  const {
    isAuthenticated, isLoading, refetch,
    events: filteredEvents, total, monitors, tags, causes, totals,
    searchQuery, setSearchQuery, notesQuery, setNotesQuery,
    monitorFilter, setMonitorFilter, causeFilter, setCauseFilter,
    tagFilter, setTagFilter, archivedFilter, setArchivedFilter,
    dateFilter, setDateInput, showDefaultHourHint, clearDefaultDateFilter,
    page, totalPages, setPage, prevPage, nextPage,
    selectedIds, clearSelection,
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
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4 flex-wrap">
              {/* Search */}
              <div className="relative">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type="text"
                  placeholder={t('Search events...')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={clsx(
                    'ps-10 pe-4 py-2 w-64',
                    'bg-surface border border-border-subtle rounded-lg',
                    'text-text-primary placeholder:text-text-muted',
                    'focus:outline-none focus:border-cyan/50',
                    'transition-colors'
                  )}
                />
              </div>

              {/* Monitor Filter */}
              <div className="relative">
                <select
                  value={monitorFilter}
                  onChange={(e) => {
                    setMonitorFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value));
                  }}
                  className={clsx(
                    'ps-3 pe-8 py-2 appearance-none',
                    'bg-surface border border-border-subtle rounded-lg',
                    'text-text-primary',
                    'focus:outline-none focus:border-cyan/50',
                    'transition-colors cursor-pointer'
                  )}
                >
                  <option value="all">{t('All Monitors')}</option>
                  {monitors.map((monitor) => (
                    <option key={monitor.id} value={monitor.id}>
                      {monitor.name}
                    </option>
                  ))}
                </select>
                <Monitor className="absolute end-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
              </div>

              {/* Cause Filter */}
              <div className="relative">
                <select
                  value={causeFilter}
                  onChange={(e) => {
                    setCauseFilter(e.target.value);
                  }}
                  className={clsx(
                    'ps-3 pe-8 py-2 appearance-none',
                    'bg-surface border border-border-subtle rounded-lg',
                    'text-text-primary',
                    'focus:outline-none focus:border-cyan/50',
                    'transition-colors cursor-pointer'
                  )}
                >
                  <option value="all">{t('All Causes')}</option>
                  {causes.map((cause) => (
                    <option key={cause} value={cause}>
                      {cause}
                    </option>
                  ))}
                </select>
                <Filter className="absolute end-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
              </div>

              {/* Date Filter */}
              <div className="relative">
                <Calendar className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                <input
                  type="date"
                  value={dateFilter ? dateFilter.slice(0, 10) : ''}
                  onChange={(e) => {
                    setDateInput(e.target.value);
                  }}
                  className={clsx(
                    'ps-10 pe-4 py-2',
                    'bg-surface border border-border-subtle rounded-lg',
                    'text-text-primary',
                    'focus:outline-none focus:border-cyan/50',
                    'transition-colors'
                  )}
                />
              </div>

              {/* Notes substring filter — client-side until backend exposes it */}
              <input
                type="text"
                placeholder={t('Notes contain…')}
                value={notesQuery}
                onChange={(e) => setNotesQuery(e.target.value)}
                className={clsx(
                  'px-3 py-2 w-44',
                  'bg-surface border border-border-subtle rounded-lg',
                  'text-text-primary placeholder:text-text-muted text-sm',
                  'focus:outline-none focus:border-cyan/50',
                  'transition-colors',
                )}
              />

              {/* Tag Filter */}
              <div className="relative">
                <select
                  value={tagFilter}
                  onChange={(e) => {
                    setTagFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value));
                  }}
                  className={clsx(
                    'ps-3 pe-8 py-2 appearance-none',
                    'bg-surface border border-border-subtle rounded-lg',
                    'text-text-primary',
                    'focus:outline-none focus:border-cyan/50',
                    'transition-colors cursor-pointer',
                  )}
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

              {/* Archived Filter */}
              <div className="flex items-center gap-1 p-1 bg-surface border border-border-subtle rounded-lg">
                {(['all', 'unarchived', 'archived'] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => {
                      setArchivedFilter(status);
                    }}
                    className={clsx(
                      'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                      archivedFilter === status
                        ? 'bg-cyan/20 text-cyan'
                        : 'text-text-muted hover:text-text-primary'
                    )}
                  >
                    {archivedLabel[status]}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Column chooser */}
              <ColumnChooser variant={columnChooserVariant} />

              {/* Refresh */}
              <button
                onClick={() => refetch()}
                className="p-2 rounded-lg bg-surface border border-border-subtle text-text-muted hover:text-text-primary hover:border-cyan/50 transition-colors"
                aria-label={t('Refresh events')}
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Default last-hour filter hint — gives the operator a one-click
              escape from the surprising "older events are hidden" default. */}
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

          {/* Event Count */}
          <div className="mb-4 flex items-center justify-between text-sm text-text-muted">
            <span>
              {t('Showing {{shown}} of {{total}} events', { shown: filteredEvents.length, total })}
            </span>
            {filteredEvents.length > 0 && (
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

          {/* Events List — table in classic skin, card list in modern */}
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="h-24 bg-surface border border-border-subtle rounded-xl animate-pulse"
                />
              ))}
            </div>
          ) : filteredEvents.length === 0 ? (
            <Panel>
              <div className="flex flex-col items-center justify-center py-16 text-text-muted">
                <Video size={48} className="mb-4 opacity-50" />
                <p className="text-lg">{t('No events found')}</p>
                <p className="text-sm mt-1">{t('Try adjusting your filters')}</p>
              </div>
            </Panel>
          ) : (
            renderList(state)
          )}

          {/* Bulk action bar — mounts only when selection is non-empty */}
          <BulkActionBar
            selectedIds={selectedIds}
            onClear={clearSelection}
          />

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <button
                onClick={prevPage}
                disabled={page === 1}
                aria-label={t('Previous page')}
                className={clsx(
                  'p-2 rounded-lg border transition-colors',
                  page === 1
                    ? 'bg-surface border-border-subtle text-text-muted cursor-not-allowed'
                    : 'bg-surface border-border-subtle text-text-primary hover:border-cyan/50'
                )}
              >
                <ChevronLeft className="w-4 h-4 rtl:-scale-x-100" />
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (page <= 3) {
                    pageNum = i + 1;
                  } else if (page >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = page - 2 + i;
                  }

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
                          : 'bg-surface border border-border-subtle text-text-secondary hover:text-text-primary hover:border-cyan/50'
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
                className={clsx(
                  'p-2 rounded-lg border transition-colors',
                  page === totalPages
                    ? 'bg-surface border-border-subtle text-text-muted cursor-not-allowed'
                    : 'bg-surface border-border-subtle text-text-primary hover:border-cyan/50'
                )}
              >
                <ChevronRight className="w-4 h-4 rtl:-scale-x-100" />
              </button>

              {/* Jump-to-page input — operators with hundreds of pages save a
                  lot of clicks vs. the « 1 2 3 … » strip. */}
              <JumpToPage
                page={page}
                totalPages={totalPages}
                onJump={(n) => setPage(n)}
              />
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
function JumpToPage({
  page,
  totalPages,
  onJump,
}: {
  page: number;
  totalPages: number;
  onJump: (n: number) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(String(page));
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Keep the local input synced with the canonical page when navigation
  // happens via the « / » buttons or the page-number strip.
  useEffect(() => {
    setValue(String(page));
  }, [page]);

  const submit = () => {
    const n = Number(value);
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      setValue(String(page));
      return;
    }
    if (n < 1 || n > totalPages) {
      setValue(String(page));
      return;
    }
    if (n === page) return;
    onJump(n);
  };

  return (
    <form
      role="search"
      aria-label={t('Jump to page')}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
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
          'w-14 px-2 py-1 rounded text-sm text-center font-mono',
          'bg-surface border border-border-subtle text-text-primary',
          'focus:outline-none focus:border-cyan/50',
          // Strip native number-input spinners — they're noisy at small sizes.
          '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
        )}
      />
      <span className="text-xs text-text-muted">{t('of {{total}}', { total: totalPages })}</span>
      <button
        type="submit"
        className="px-2 py-1 rounded text-xs text-cyan border border-cyan/40 hover:bg-cyan/15 transition-colors"
      >
        {t('Go')}
      </button>
    </form>
  );
}

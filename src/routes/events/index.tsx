import { createFileRoute, Link, useSearch } from '@tanstack/react-router';
import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import {
  Video,
  Search,
  Filter,
  RefreshCw,
  Calendar,
  Clock,
  Monitor,
  Play,
  ChevronLeft,
  ChevronRight,
  Archive,
  Tag as TagIcon,
  Download,
  X,
} from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { getEvents, getEventThumbnailUrl, getEventVideoUrl } from '@/api/events';
import { getMonitors } from '@/api/monitors';
import { listTags } from '@/api/tags';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import { ClassicEventsTable } from '@/features/events/ClassicEventsTable';
import { BulkActionBar } from '@/features/events/BulkActionBar';
import { ColumnChooser } from '@/features/events/ColumnChooser';
import { formatBytes } from '@/lib/format';
import { sumEventDurations, sumEventDiskSpace, formatDuration } from '@/features/events/duration';
import type { ZmEvent } from '@/types';
import { isOrientationRotated, getOrientationStyle, getOrientationFillStyle } from '@/types';

interface EventsSearchParams {
  monitor_id?: number;
  cause?: string;
  archived?: boolean;
}

export const Route = createFileRoute('/events/')({
  component: EventsPage,
  validateSearch: (search: Record<string, unknown>): EventsSearchParams => ({
    monitor_id: search.monitor_id as number | undefined,
    cause: search.cause as string | undefined,
    archived: search.archived as boolean | undefined,
  }),
});

/**
 * Lower bound for the default "last hour" start-time filter. Pulled into a
 * helper so tests / time-mocked code paths can reason about it directly.
 * Returns a full ISO timestamp (`YYYY-MM-DDTHH:MM:SSZ`). The backend's
 * `start_time` query strict-parses — the short form (no seconds / no Z)
 * is rejected with a JSON parse error, which silently returns 0 events
 * (see BACKEND-TICKETS.md / e2e events.spec.ts regression).
 */
export function defaultStartTimeLowerBound(now: Date = new Date()): string {
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  return oneHourAgo.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Normalises a date input ('YYYY-MM-DD' from <input type="date">) to a
 * full ISO timestamp at start-of-day UTC, so it survives the backend's
 * strict parser.
 */
export function dateInputToStartTime(value: string): string {
  if (!value) return '';
  // Already a full ISO timestamp — pass through.
  if (value.length > 10) return value;
  return `${value}T00:00:00Z`;
}

function EventsPage() {
  const { isAuthenticated, accessToken } = useAuthStore();
  const skin = useUiStore((s) => s.skin);
  const searchParams = useSearch({ from: '/events/' });

  const [searchQuery, setSearchQuery] = useState('');
  const [notesQuery, setNotesQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<number | 'all'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const [monitorFilter, setMonitorFilter] = useState<number | 'all'>(
    searchParams.monitor_id || 'all'
  );
  const [causeFilter, setCauseFilter] = useState<string>(searchParams.cause || 'all');
  const [archivedFilter, setArchivedFilter] = useState<'all' | 'archived' | 'unarchived'>('all');
  // Default to "last hour" on first land — matches legacy ZM behaviour.
  // Operators can clear it with the "Showing last hour only — clear" link
  // that appears above the list.
  const [dateFilter, setDateFilter] = useState<string>(() => defaultStartTimeLowerBound());
  // Tracks whether the date filter is still the auto-seeded "now - 1h"
  // value. Used to gate the clear-affordance.
  const [defaultDateActive, setDefaultDateActive] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Fetch monitors for filter dropdown
  const { data: monitorsData } = useQuery({
    queryKey: ['monitors'],
    queryFn: () => getMonitors({ page: 1, page_size: 100 }),
    enabled: isAuthenticated,
  });

  // Fetch tags for filter dropdown
  const { data: tagsData } = useQuery({
    queryKey: ['tags'],
    queryFn: () => listTags({ page: 1, page_size: 200 }),
    enabled: isAuthenticated,
  });
  const tags = tagsData?.items ?? [];

  // Fetch events
  const { data: eventsData, isLoading, refetch } = useQuery({
    queryKey: [
      'events',
      page,
      pageSize,
      monitorFilter,
      causeFilter,
      archivedFilter,
      dateFilter,
    ],
    queryFn: () =>
      getEvents({
        page,
        page_size: pageSize,
        monitor_id: monitorFilter === 'all' ? undefined : monitorFilter,
        cause: causeFilter === 'all' ? undefined : causeFilter,
        archived: archivedFilter === 'all' ? undefined : archivedFilter === 'archived',
        start_time: dateFilter || undefined,
      }),
    enabled: isAuthenticated,
    refetchInterval: 30000,
  });

  const events = eventsData?.items || [];
  const totalPages = eventsData?.last_page || 1;
  const monitors = monitorsData?.items || [];

  // Create monitor lookup
  const monitorLookup = useMemo(() => {
    const lookup: Record<number, string> = {};
    monitors.forEach((m) => {
      lookup[m.id] = m.name;
    });
    return lookup;
  }, [monitors]);

  // Filter by search query, notes substring, and tag attachment. Backend
  // doesn't yet support notes/tags as query params, so these filters run
  // client-side over the current page — fine for typical event volumes,
  // and clearly labelled in the UI.
  const filteredEvents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const notes = notesQuery.trim().toLowerCase();
    return events.filter((event) => {
      if (query) {
        const matches =
          event.name.toLowerCase().includes(query) ||
          event.cause?.toLowerCase().includes(query) ||
          monitorLookup[event.monitor_id]?.toLowerCase().includes(query);
        if (!matches) return false;
      }
      if (notes) {
        if (!event.notes?.toLowerCase().includes(notes)) return false;
      }
      if (tagFilter !== 'all') {
        if (!event.tags?.some((t) => t.id === tagFilter)) return false;
      }
      return true;
    });
  }, [events, searchQuery, notesQuery, tagFilter, monitorLookup]);

  // Footer totals for the modern card layout — sum across the visible page.
  const totals = useMemo(() => ({
    duration: sumEventDurations(filteredEvents),
    disk: sumEventDiskSpace(filteredEvents),
  }), [filteredEvents]);

  // Get unique causes for filter
  const causes = useMemo(() => {
    const causeSet = new Set(events.map((e) => e.cause).filter((c): c is string => !!c));
    return Array.from(causeSet).sort();
  }, [events]);

  // The "last hour only" hint should only appear when the auto-seeded date
  // is still the only filter applied — once the operator narrows the list
  // any further, the hint is just noise.
  const noOtherFiltersApplied =
    monitorFilter === 'all' &&
    causeFilter === 'all' &&
    archivedFilter === 'all' &&
    tagFilter === 'all' &&
    searchQuery.trim() === '' &&
    notesQuery.trim() === '';
  const showDefaultHourHint = defaultDateActive && dateFilter !== '' && noOtherFiltersApplied;

  const clearDefaultDateFilter = () => {
    setDateFilter('');
    setDefaultDateActive(false);
    setPage(1);
  };

  if (!isAuthenticated) return null;

  return (
    <AppShell title="Events">
      <main className="flex-1 p-6 overflow-auto">
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4 flex-wrap">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type="text"
                  placeholder="Search events..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={clsx(
                    'pl-10 pr-4 py-2 w-64',
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
                    setPage(1);
                  }}
                  className={clsx(
                    'pl-3 pr-8 py-2 appearance-none',
                    'bg-surface border border-border-subtle rounded-lg',
                    'text-text-primary',
                    'focus:outline-none focus:border-cyan/50',
                    'transition-colors cursor-pointer'
                  )}
                >
                  <option value="all">All Monitors</option>
                  {monitors.map((monitor) => (
                    <option key={monitor.id} value={monitor.id}>
                      {monitor.name}
                    </option>
                  ))}
                </select>
                <Monitor className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
              </div>

              {/* Cause Filter */}
              <div className="relative">
                <select
                  value={causeFilter}
                  onChange={(e) => {
                    setCauseFilter(e.target.value);
                    setPage(1);
                  }}
                  className={clsx(
                    'pl-3 pr-8 py-2 appearance-none',
                    'bg-surface border border-border-subtle rounded-lg',
                    'text-text-primary',
                    'focus:outline-none focus:border-cyan/50',
                    'transition-colors cursor-pointer'
                  )}
                >
                  <option value="all">All Causes</option>
                  {causes.map((cause) => (
                    <option key={cause} value={cause}>
                      {cause}
                    </option>
                  ))}
                </select>
                <Filter className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
              </div>

              {/* Date Filter */}
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                <input
                  type="date"
                  value={dateFilter ? dateFilter.slice(0, 10) : ''}
                  onChange={(e) => {
                    setDateFilter(dateInputToStartTime(e.target.value));
                    setDefaultDateActive(false);
                    setPage(1);
                  }}
                  className={clsx(
                    'pl-10 pr-4 py-2',
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
                placeholder="Notes contain…"
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
                    setPage(1);
                  }}
                  className={clsx(
                    'pl-3 pr-8 py-2 appearance-none',
                    'bg-surface border border-border-subtle rounded-lg',
                    'text-text-primary',
                    'focus:outline-none focus:border-cyan/50',
                    'transition-colors cursor-pointer',
                  )}
                >
                  <option value="all">All Tags</option>
                  {tags.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.event_count != null ? ` (${t.event_count})` : ''}
                    </option>
                  ))}
                </select>
                <TagIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
              </div>

              {/* Archived Filter */}
              <div className="flex items-center gap-1 p-1 bg-surface border border-border-subtle rounded-lg">
                {(['all', 'unarchived', 'archived'] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => {
                      setArchivedFilter(status);
                      setPage(1);
                    }}
                    className={clsx(
                      'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                      archivedFilter === status
                        ? 'bg-cyan/20 text-cyan'
                        : 'text-text-muted hover:text-text-primary'
                    )}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Column chooser */}
              <ColumnChooser variant={skin === 'classic' ? 'classic' : 'modern'} />

              {/* Refresh */}
              <button
                onClick={() => refetch()}
                className="p-2 rounded-lg bg-surface border border-border-subtle text-text-muted hover:text-text-primary hover:border-cyan/50 transition-colors"
                aria-label="Refresh events"
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
                Showing events from the last hour only
              </span>
              <button
                type="button"
                onClick={clearDefaultDateFilter}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs hover:bg-amber/20 transition-colors"
              >
                <X size={12} />
                Clear
              </button>
            </div>
          )}

          {/* Event Count */}
          <div className="mb-4 flex items-center justify-between text-sm text-text-muted">
            <span>
              Showing {filteredEvents.length} of {eventsData?.total || 0} events
            </span>
            {filteredEvents.length > 0 && (
              <span className="flex items-center gap-3 font-mono text-xs">
                <span data-testid="modern-total-duration">
                  Σ Duration {formatDuration(totals.duration)}
                </span>
                <span data-testid="modern-total-disk">
                  Σ Disk {formatBytes(totals.disk)}
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
                <p className="text-lg">No events found</p>
                <p className="text-sm mt-1">Try adjusting your filters</p>
              </div>
            </Panel>
          ) : skin === 'classic' ? (
            <ClassicEventsTable
              events={filteredEvents}
              monitorLookup={monitorLookup}
              selectedIds={selectedIds}
              onToggleSelected={toggleSelected}
              token={accessToken}
            />
          ) : (
            <div className="space-y-3 stagger-children">
              {filteredEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  monitorName={monitorLookup[event.monitor_id] || `Monitor ${event.monitor_id}`}
                  token={accessToken}
                  isSelected={selectedIds.has(event.id)}
                  onToggleSelected={() => toggleSelected(event.id)}
                />
              ))}
            </div>
          )}

          {/* Bulk action bar — mounts only when selection is non-empty */}
          <BulkActionBar
            selectedIds={selectedIds}
            onClear={() => setSelectedIds(new Set())}
          />

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                aria-label="Previous page"
                className={clsx(
                  'p-2 rounded-lg border transition-colors',
                  page === 1
                    ? 'bg-surface border-border-subtle text-text-muted cursor-not-allowed'
                    : 'bg-surface border-border-subtle text-text-primary hover:border-cyan/50'
                )}
              >
                <ChevronLeft className="w-4 h-4" />
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
                      aria-label={`Go to page ${pageNum}`}
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
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                aria-label="Next page"
                className={clsx(
                  'p-2 rounded-lg border transition-colors',
                  page === totalPages
                    ? 'bg-surface border-border-subtle text-text-muted cursor-not-allowed'
                    : 'bg-surface border-border-subtle text-text-primary hover:border-cyan/50'
                )}
              >
                <ChevronRight className="w-4 h-4" />
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
      aria-label="Jump to page"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex items-center gap-1 ml-2"
    >
      <span className="text-xs text-text-muted">Page</span>
      <input
        ref={inputRef}
        type="number"
        inputMode="numeric"
        min={1}
        max={totalPages}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={submit}
        aria-label="Jump to page"
        className={clsx(
          'w-14 px-2 py-1 rounded text-sm text-center font-mono',
          'bg-surface border border-border-subtle text-text-primary',
          'focus:outline-none focus:border-cyan/50',
          // Strip native number-input spinners — they're noisy at small sizes.
          '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
        )}
      />
      <span className="text-xs text-text-muted">of {totalPages}</span>
      <button
        type="submit"
        className="px-2 py-1 rounded text-xs text-cyan border border-cyan/40 hover:bg-cyan/15 transition-colors"
      >
        Go
      </button>
    </form>
  );
}

export function EventCard({
  event,
  monitorName,
  token,
  isSelected,
  onToggleSelected,
}: {
  event: ZmEvent;
  monitorName: string;
  token?: string | null;
  isSelected: boolean;
  onToggleSelected: () => void;
}) {
  const startTime = event.start_date_time ? new Date(event.start_date_time) : null;
  const endTime = event.end_date_time ? new Date(event.end_date_time) : null;
  const duration = event.length ? Math.round(event.length) : null;

  const getCauseColor = (cause: string) => {
    const lowerCause = cause.toLowerCase();
    if (lowerCause.includes('motion')) return 'bg-amber/20 text-amber';
    if (lowerCause.includes('alarm')) return 'bg-crimson/20 text-crimson';
    if (lowerCause.includes('continuous')) return 'bg-cyan/20 text-cyan';
    return 'bg-text-muted/20 text-text-secondary';
  };

  return (
    <div
      className={clsx(
        'flex items-center gap-3 p-4 group',
        'bg-surface border rounded-xl',
        'transition-all duration-base',
        isSelected
          ? 'border-cyan/60 shadow-lg shadow-cyan/10'
          : 'border-border-subtle hover:border-cyan/50 hover:shadow-lg hover:shadow-cyan/10',
      )}
    >
      {/* Selection checkbox — opt-in, doesn't compete with the Link target */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleSelected(); }}
        aria-label={isSelected ? 'Deselect event' : 'Select event'}
        className={clsx(
          'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0',
          'transition-all',
          isSelected
            ? 'border-cyan bg-cyan/20'
            : 'border-border opacity-0 group-hover:opacity-100 hover:border-cyan',
        )}
      >
        {isSelected && <span className="text-cyan text-xs leading-none">✓</span>}
      </button>

      <Link
        to="/events/$eventId"
        params={{ eventId: String(event.id) }}
        className="flex items-center gap-4 flex-1 min-w-0"
      >
        {/* Thumbnail — the backend's /thumbnail endpoint renders at the
            sensor's native (landscape) aspect, so rotated cameras need a
            CSS rotation to display the subject upright. For rotated
            events the container itself goes portrait (9:16) so the
            swap-dim style fills it without letterboxing — rows grow
            taller but the operator gets a usable preview. */}
      <div
        className={clsx(
          'w-40 relative rounded-lg overflow-hidden bg-abyss flex-shrink-0',
          isOrientationRotated(event.orientation)
            ? 'aspect-[9/16]'
            : 'aspect-video',
        )}
      >
        <img
          src={getEventThumbnailUrl(event.id, token || undefined)}
          alt={event.name}
          className={
            isOrientationRotated(event.orientation)
              ? 'object-cover bg-abyss'
              : 'w-full h-full object-cover'
          }
          style={
            isOrientationRotated(event.orientation)
              ? getOrientationFillStyle(event.orientation)
              : getOrientationStyle(event.orientation)
          }
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <Play size={24} className="text-white/80" />
        </div>
        {duration && (
          <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/70 text-[10px] font-mono text-white">
            {duration}s
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-2">
          <h3 className="font-medium text-text-primary truncate">{event.name}</h3>
          <span className="text-xs font-mono text-text-muted">#{event.id}</span>
          {event.archived === 1 && (
            <span className="flex items-center gap-1 text-xs text-amber">
              <Archive size={12} />
              Archived
            </span>
          )}
        </div>

        <div className="flex items-center gap-4 text-sm text-text-secondary mb-2 flex-wrap">
          <span className="flex items-center gap-1.5">
            <Monitor size={14} className="text-text-muted" />
            {monitorName}
          </span>
          {event.cause && (
            <span
              className={clsx(
                'px-2 py-0.5 rounded text-xs font-medium',
                getCauseColor(event.cause)
              )}
            >
              {event.cause}
            </span>
          )}
          {event.tags && event.tags.length > 0 && (
            <span className="flex items-center gap-1 flex-wrap">
              {event.tags.map((t) => (
                <span
                  key={t.id}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan/15 border border-cyan/30 text-cyan text-[10px]"
                >
                  <TagIcon size={9} />
                  {t.name}
                </span>
              ))}
            </span>
          )}
        </div>

        <div className="flex items-center gap-4 text-xs text-text-muted">
          {startTime && (
            <>
              <span className="flex items-center gap-1.5">
                <Calendar size={12} />
                {startTime.toLocaleDateString()}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock size={12} />
                {startTime.toLocaleTimeString()}
                {endTime && ` - ${endTime.toLocaleTimeString()}`}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-5 text-right">
        {event.frames != null && event.frames > 0 && (
          <div>
            <p className="text-lg font-mono font-medium text-text-primary">{event.frames}</p>
            <p className="text-xs text-text-muted">Frames</p>
          </div>
        )}
        {event.alarm_frames != null && event.alarm_frames > 0 && (
          <div>
            <p className="text-lg font-mono font-medium text-crimson">{event.alarm_frames}</p>
            <p className="text-xs text-text-muted">Alarm</p>
          </div>
        )}
        {event.tot_score != null && event.tot_score > 0 && (
          <div>
            <p className="text-lg font-mono font-medium text-text-primary">{event.tot_score}</p>
            <p className="text-xs text-text-muted">Tot</p>
          </div>
        )}
        {event.avg_score != null && event.avg_score > 0 && (
          <div>
            <p className="text-lg font-mono font-medium text-cyan">{event.avg_score}</p>
            <p className="text-xs text-text-muted">Avg</p>
          </div>
        )}
        {event.max_score != null && event.max_score > 0 && (
          <div>
            <p className="text-lg font-mono font-medium text-amber">{event.max_score}</p>
            <p className="text-xs text-text-muted">Max</p>
          </div>
        )}
      </div>
      </Link>

      {/* Per-row Download Video — sits outside the <Link> so clicking it
          doesn't navigate to event-detail. */}
      <a
        href={getEventVideoUrl(event.id, token ?? undefined)}
        target="_blank"
        rel="noopener noreferrer"
        download={`event-${event.id}.mp4`}
        aria-label={`Download video for event ${event.id}`}
        title="Download video"
        className={clsx(
          'flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0',
          'border border-border-subtle text-text-muted',
          'hover:border-cyan/50 hover:text-cyan transition-colors',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <Download size={14} />
      </a>
    </div>
  );
}

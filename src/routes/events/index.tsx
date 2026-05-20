import { createFileRoute, Link, useSearch } from '@tanstack/react-router';
import { useState, useMemo } from 'react';
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
} from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import { getEvents, getEventThumbnailUrl } from '@/api/events';
import { getMonitors } from '@/api/monitors';
import { listTags } from '@/api/tags';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import { ClassicEventsTable } from '@/features/events/ClassicEventsTable';
import { BulkActionBar } from '@/features/events/BulkActionBar';
import type { ZmEvent } from '@/types';

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
  const [dateFilter, setDateFilter] = useState<string>('');
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
        start_date: dateFilter || undefined,
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

  // Get unique causes for filter
  const causes = useMemo(() => {
    const causeSet = new Set(events.map((e) => e.cause).filter((c): c is string => !!c));
    return Array.from(causeSet).sort();
  }, [events]);

  if (!isAuthenticated) return null;

  return (
    <AppShell title="Events">
      <main className="flex-1 p-6 overflow-auto">
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
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
                  value={dateFilter}
                  onChange={(e) => {
                    setDateFilter(e.target.value);
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

            {/* Refresh */}
            <button
              onClick={() => refetch()}
              className="p-2 rounded-lg bg-surface border border-border-subtle text-text-muted hover:text-text-primary hover:border-cyan/50 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Event Count */}
          <div className="mb-4 text-sm text-text-muted">
            Showing {filteredEvents.length} of {eventsData?.total || 0} events
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
                className={clsx(
                  'p-2 rounded-lg border transition-colors',
                  page === totalPages
                    ? 'bg-surface border-border-subtle text-text-muted cursor-not-allowed'
                    : 'bg-surface border-border-subtle text-text-primary hover:border-cyan/50'
                )}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
      </main>
    </AppShell>
  );
}

function EventCard({
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
        {/* Thumbnail */}
      <div className="w-40 aspect-video relative rounded-lg overflow-hidden bg-abyss flex-shrink-0">
        <img
          src={getEventThumbnailUrl(event.id, token || undefined)}
          alt={event.name}
          className="w-full h-full object-cover"
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
    </div>
  );
}

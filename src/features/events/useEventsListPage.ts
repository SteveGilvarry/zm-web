import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { getEvents } from '@/api/events';
import { getMonitors } from '@/api/monitors';
import { listTags, type Tag } from '@/api/tags';
import { useAuthStore } from '@/stores/auth';
import { sumEventDurations, sumEventDiskSpace } from '@/features/events/duration';
import type { Monitor, ZmEvent } from '@/types';

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

export type ArchivedFilter = 'all' | 'archived' | 'unarchived';

export interface EventsListPageState {
  isAuthenticated: boolean;
  accessToken: string | null;
  isLoading: boolean;
  refetch: () => void;

  /** Events on the current page after client-side search/notes/tag filters. */
  events: ZmEvent[];
  total: number;
  monitors: Monitor[];
  monitorLookup: Record<number, string>;
  tags: Tag[];
  causes: string[];
  /** Σ duration / Σ disk across the visible page. */
  totals: { duration: number; disk: number };

  searchQuery: string;
  setSearchQuery: (v: string) => void;
  notesQuery: string;
  setNotesQuery: (v: string) => void;
  monitorFilter: number | 'all';
  setMonitorFilter: (v: number | 'all') => void;
  causeFilter: string;
  setCauseFilter: (v: string) => void;
  tagFilter: number | 'all';
  setTagFilter: (v: number | 'all') => void;
  archivedFilter: ArchivedFilter;
  setArchivedFilter: (v: ArchivedFilter) => void;
  /** Full ISO lower bound, or '' for no date filter. */
  dateFilter: string;
  /** Takes the raw `<input type="date">` value. */
  setDateInput: (v: string) => void;
  showDefaultHourHint: boolean;
  clearDefaultDateFilter: () => void;

  page: number;
  totalPages: number;
  setPage: (n: number) => void;
  prevPage: () => void;
  nextPage: () => void;

  selectedIds: Set<number>;
  toggleSelected: (id: number) => void;
  clearSelection: () => void;
}

const PAGE_SIZE = 20;

/**
 * Data, filters, pagination and selection for the Events list. Skin-agnostic:
 * the modern card list and the classic table both render from this hook.
 * Initial monitor/cause filters come from the route's search params.
 */
export function useEventsListPage(): EventsListPageState {
  const { isAuthenticated, accessToken } = useAuthStore();
  const searchParams = useSearch({ from: '/events/' });

  const [searchQuery, setSearchQuery] = useState('');
  const [notesQuery, setNotesQuery] = useState('');
  const [tagFilter, setTagFilterState] = useState<number | 'all'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const [monitorFilter, setMonitorFilterState] = useState<number | 'all'>(
    searchParams.monitor_id || 'all'
  );
  const [causeFilter, setCauseFilterState] = useState<string>(searchParams.cause || 'all');
  const [archivedFilter, setArchivedFilterState] = useState<ArchivedFilter>('all');
  // Default to "last hour" on first land — matches legacy ZM behaviour.
  // Operators can clear it with the "Showing last hour only — clear" link
  // that appears above the list.
  const [dateFilter, setDateFilter] = useState<string>(() => defaultStartTimeLowerBound());
  // Tracks whether the date filter is still the auto-seeded "now - 1h"
  // value. Used to gate the clear-affordance.
  const [defaultDateActive, setDefaultDateActive] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = PAGE_SIZE;

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

  const events = useMemo(() => eventsData?.items || [], [eventsData]);
  const totalPages = eventsData?.last_page || 1;
  const monitors = useMemo(() => monitorsData?.items || [], [monitorsData]);

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

  // Every filter change resets to page 1, as the old inline handlers did.
  const setMonitorFilter = (v: number | 'all') => { setMonitorFilterState(v); setPage(1); };
  const setCauseFilter = (v: string) => { setCauseFilterState(v); setPage(1); };
  const setTagFilter = (v: number | 'all') => { setTagFilterState(v); setPage(1); };
  const setArchivedFilter = (v: ArchivedFilter) => { setArchivedFilterState(v); setPage(1); };
  const setDateInput = (v: string) => {
    setDateFilter(dateInputToStartTime(v));
    setDefaultDateActive(false);
    setPage(1);
  };

  return {
    isAuthenticated,
    accessToken,
    isLoading,
    refetch: () => { refetch(); },

    events: filteredEvents,
    total: eventsData?.total || 0,
    monitors,
    monitorLookup,
    tags,
    causes,
    totals,

    searchQuery,
    setSearchQuery,
    notesQuery,
    setNotesQuery,
    monitorFilter,
    setMonitorFilter,
    causeFilter,
    setCauseFilter,
    tagFilter,
    setTagFilter,
    archivedFilter,
    setArchivedFilter,
    dateFilter,
    setDateInput,
    showDefaultHourHint,
    clearDefaultDateFilter,

    page,
    totalPages,
    setPage,
    prevPage: () => setPage((p) => Math.max(1, p - 1)),
    nextPage: () => setPage((p) => Math.min(totalPages, p + 1)),

    selectedIds,
    toggleSelected,
    clearSelection: () => setSelectedIds(new Set()),
  };
}

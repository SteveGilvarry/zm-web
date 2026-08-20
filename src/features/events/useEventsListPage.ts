import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import {
  getEvents,
  legacySortFieldToApi,
  type EventSortField,
  type SortDirection,
} from '@/api/events';
import { getMonitors } from '@/api/monitors';
import { listTags, type Tag } from '@/api/tags';
import { useAuthStore } from '@/stores/auth';
import { useEventPlaybackStore } from '@/stores/eventPlayback';
import { useZmConfig } from '@/features/config/useZmConfig';
import { sumEventDurations, sumEventDiskSpace } from '@/features/events/duration';
import { toLocalDatetime } from '@/features/reports/datetime';
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
  return toApiTimestamp(oneHourAgo);
}

function toApiTimestamp(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Normalises a date/time input to the full ISO timestamp the backend's
 * strict parser wants. Accepts what the two input types emit:
 *  - `YYYY-MM-DD` (`<input type="date">`) → local midnight that day;
 *  - `YYYY-MM-DDTHH:MM[:SS]` (`<input type="datetime-local">`) → that local
 *    wall-clock time.
 * Both are interpreted in the browser's zone — the operator typed a local
 * time, not a UTC one. A value that already carries `Z` or an offset passes
 * through unchanged.
 */
export function dateInputToStartTime(value: string): string {
  if (!value) return '';
  if (/(Z|[+-]\d{2}:\d{2})$/.test(value)) return value;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00` : value);
  return Number.isNaN(d.getTime()) ? '' : toApiTimestamp(d);
}

/** The inverse: an ISO lower bound as the `datetime-local` input value. */
export function startTimeToDateInput(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : toLocalDatetime(d);
}

export type ArchivedFilter = 'all' | 'archived' | 'unarchived';

/** Page sizes offered in the selector (legacy bootstrap-table list). */
export const EVENTS_PAGE_SIZE_OPTIONS: readonly number[] = [5, 10, 25, 50, 100, 200, 500];

export interface EventsListPageState {
  isAuthenticated: boolean;
  accessToken: string | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;

  /** Events on the current page after client-side search/cause/notes/tag filters. */
  events: ZmEvent[];
  total: number;
  monitors: Monitor[];
  monitorLookup: Record<number, string>;
  tags: Tag[];
  /** Distinct causes on the fetched page (plus the active filter, if any). */
  causes: string[];
  /** Σ duration / Σ disk across the visible page. */
  totals: { duration: number; disk: number };

  searchQuery: string;
  setSearchQuery: (v: string) => void;
  notesQuery: string;
  setNotesQuery: (v: string) => void;
  monitorFilter: number | 'all';
  setMonitorFilter: (v: number | 'all') => void;
  /** Client-side (the backend has no cause parameter). */
  causeFilter: string;
  setCauseFilter: (v: string) => void;
  tagFilter: number | 'all';
  setTagFilter: (v: number | 'all') => void;
  archivedFilter: ArchivedFilter;
  setArchivedFilter: (v: ArchivedFilter) => void;
  /** Full ISO lower bound, or '' for no date filter. */
  dateFilter: string;
  /** `dateFilter` as a `datetime-local` input value (local wall clock). */
  dateInputValue: string;
  /** Takes the raw `<input type="datetime-local">` (or `date`) value. */
  setDateInput: (v: string) => void;
  showDefaultHourHint: boolean;
  clearDefaultDateFilter: () => void;

  /** Server-side sort (one of the backend's eight `EventSortField`s). */
  sortField: EventSortField;
  sortDir: SortDirection;
  /** Header click: same field flips direction, new field sorts ascending. */
  toggleSort: (field: EventSortField) => void;
  setSortDir: (dir: SortDirection) => void;

  page: number;
  pageSize: number;
  /** Selector options — the standard list plus whatever the config says. */
  pageSizeOptions: number[];
  setPageSize: (n: number) => void;
  totalPages: number;
  setPage: (n: number) => void;
  prevPage: () => void;
  nextPage: () => void;

  /** `ZM_WEB_LIST_THUMBS` / `ZM_WEB_LIST_THUMB_WIDTH`. */
  showThumbs: boolean;
  thumbWidth: number;

  selectedIds: Set<number>;
  toggleSelected: (id: number) => void;
  clearSelection: () => void;
}

/**
 * Data, filters, pagination and selection for the Events list. Skin-agnostic:
 * the modern card list and the classic table both render from this hook.
 * Initial monitor/cause/archived filters come from the route's search
 * params; page size, default sort and thumbnails follow the `ZM_WEB_*`
 * config rows the legacy UI honours.
 */
export function useEventsListPage(): EventsListPageState {
  const { isAuthenticated, accessToken } = useAuthStore();
  const searchParams = useSearch({ from: '/events/' });

  const configPageSize = useZmConfig('ZM_WEB_EVENTS_PER_PAGE', 25);
  const configSortField = useZmConfig('ZM_WEB_EVENT_SORT_FIELD', 'StartDateTime');
  const configSortOrder = useZmConfig('ZM_WEB_EVENT_SORT_ORDER', 'asc');
  const showThumbs = useZmConfig('ZM_WEB_LIST_THUMBS', true);
  const configThumbWidth = useZmConfig('ZM_WEB_LIST_THUMB_WIDTH', 48);
  const thumbWidth = configThumbWidth > 0 ? configThumbWidth : 48;

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
  const [archivedFilter, setArchivedFilterState] = useState<ArchivedFilter>(
    searchParams.archived === true ? 'archived'
      : searchParams.archived === false ? 'unarchived'
      : 'all',
  );
  // Default to "last hour" on a plain landing — matches legacy ZM behaviour.
  // Operators can clear it with the "Showing last hour only — clear" link
  // that appears above the list. A deep link that already names a filter
  // (`?archived=true` from Audit, `?monitor_id=` from a monitor page) asks
  // for that set, not "that set within the last hour", so it starts unbounded.
  const deepLinked =
    searchParams.archived !== undefined || !!searchParams.monitor_id || !!searchParams.cause;
  const [dateFilter, setDateFilter] = useState<string>(() =>
    deepLinked ? '' : defaultStartTimeLowerBound(),
  );
  // Tracks whether the date filter is still the auto-seeded "now - 1h"
  // value. Used to gate the clear-affordance.
  const [defaultDateActive, setDefaultDateActive] = useState(!deepLinked);
  const [page, setPage] = useState(1);

  // Page size and sort follow the ZM_WEB_* config until the operator picks
  // their own; `null` means "still following the config".
  const [pageSizeOverride, setPageSizeOverride] = useState<number | null>(null);
  const pageSize = pageSizeOverride ?? (configPageSize > 0 ? configPageSize : 25);
  const [sortOverride, setSortOverride] = useState<{ field: EventSortField; dir: SortDirection } | null>(null);
  const sortField = sortOverride?.field ?? legacySortFieldToApi(configSortField);
  const sortDir = sortOverride?.dir ?? (configSortOrder.toLowerCase() === 'desc' ? 'desc' : 'asc');

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

  // Fetch events. Cause is not a backend parameter, so it is not in the key.
  const { data: eventsData, isLoading, error, refetch } = useQuery({
    queryKey: [
      'events',
      page,
      pageSize,
      monitorFilter,
      archivedFilter,
      dateFilter,
      sortField,
      sortDir,
    ],
    queryFn: () =>
      getEvents({
        page,
        page_size: pageSize,
        monitor_id: monitorFilter === 'all' ? undefined : monitorFilter,
        archived: archivedFilter === 'all' ? undefined : archivedFilter === 'archived',
        start_time: dateFilter || undefined,
        sort: sortField,
        direction: sortDir,
      }),
    enabled: isAuthenticated,
    refetchInterval: 30000,
  });

  const events = useMemo(() => eventsData?.items || [], [eventsData]);
  const totalPages = eventsData?.last_page || 1;
  const monitors = useMemo(() => monitorsData?.items || [], [monitorsData]);

  // Tell the event detail page which set Prev/Next should walk: the monitor
  // this list is filtered to, or every monitor when unfiltered.
  const setNavScope = useEventPlaybackStore((s) => s.setNavScope);
  useEffect(() => {
    setNavScope({ monitorId: monitorFilter === 'all' ? null : monitorFilter });
  }, [monitorFilter, setNavScope]);

  // Create monitor lookup
  const monitorLookup = useMemo(() => {
    const lookup: Record<number, string> = {};
    monitors.forEach((m) => {
      lookup[m.id] = m.name;
    });
    return lookup;
  }, [monitors]);

  // Filter by search query, cause, notes substring, and tag attachment. The
  // backend has no cause/notes/tags query params, so these run client-side
  // over the current page — fine for typical event volumes, and labelled
  // as page-local in the UI.
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
      if (causeFilter !== 'all' && (event.cause ?? '') !== causeFilter) return false;
      if (notes) {
        if (!event.notes?.toLowerCase().includes(notes)) return false;
      }
      if (tagFilter !== 'all') {
        if (!event.tags?.some((t) => t.id === tagFilter)) return false;
      }
      return true;
    });
  }, [events, searchQuery, causeFilter, notesQuery, tagFilter, monitorLookup]);

  // Footer totals for the modern card layout — sum across the visible page.
  const totals = useMemo(() => ({
    duration: sumEventDurations(filteredEvents),
    disk: sumEventDiskSpace(filteredEvents),
  }), [filteredEvents]);

  // Distinct causes on the page. The active filter stays in the list even
  // when the page has no such event, so the select never shows a value it
  // has no option for.
  const causes = useMemo(() => {
    const causeSet = new Set(events.map((e) => e.cause).filter((c): c is string => !!c));
    if (causeFilter !== 'all') causeSet.add(causeFilter);
    return Array.from(causeSet).sort();
  }, [events, causeFilter]);

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
  const setPageSize = (n: number) => {
    if (!Number.isFinite(n) || n <= 0) return;
    setPageSizeOverride(n);
    setPage(1);
  };
  const toggleSort = (field: EventSortField) => {
    setSortOverride(
      field === sortField
        ? { field, dir: sortDir === 'asc' ? 'desc' : 'asc' }
        : { field, dir: 'asc' },
    );
    setPage(1);
  };
  const setSortDir = (dir: SortDirection) => {
    setSortOverride({ field: sortField, dir });
    setPage(1);
  };

  const pageSizeOptions = useMemo(
    () => Array.from(new Set([...EVENTS_PAGE_SIZE_OPTIONS, pageSize])).sort((a, b) => a - b),
    [pageSize],
  );

  return {
    isAuthenticated,
    accessToken,
    isLoading,
    error: (error as Error | null) ?? null,
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
    dateInputValue: startTimeToDateInput(dateFilter),
    setDateInput,
    showDefaultHourHint,
    clearDefaultDateFilter,

    sortField,
    sortDir,
    toggleSort,
    setSortDir,

    page,
    pageSize,
    pageSizeOptions,
    setPageSize,
    totalPages,
    setPage,
    prevPage: () => setPage((p) => Math.max(1, p - 1)),
    nextPage: () => setPage((p) => Math.min(totalPages, p + 1)),

    showThumbs,
    thumbWidth,

    selectedIds,
    toggleSelected,
    clearSelection: () => setSelectedIds(new Set()),
  };
}

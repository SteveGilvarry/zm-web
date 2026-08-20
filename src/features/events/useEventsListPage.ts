import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import {
  getEvents,
  legacySortFieldToApi,
  type EventSortField,
  type SortDirection,
} from '@/api/events';
import { previewFilter, type FilterAstExpr, type FilterTerm } from '@/api/filters';
import { listGroupMonitors, listGroups, type Group } from '@/api/groups';
import { getMonitors } from '@/api/monitors';
import { getStorageList } from '@/api/storage';
import { listTags, type Tag } from '@/api/tags';
import { useAuthStore } from '@/stores/auth';
import { useEventPlaybackStore } from '@/stores/eventPlayback';
import { useEventsColumnsStore, EVENTS_COLUMNS, type EventsColumnKey } from '@/stores/eventsColumns';
import { useZmConfig } from '@/features/config/useZmConfig';
import { sumEventDurations, sumEventDiskSpace } from '@/features/events/duration';
import { downloadCsv } from '@/features/logs/csv';
import { toLocalDatetime } from '@/features/reports/datetime';
import i18next from '@/i18n';
import type { Monitor, PaginatedResponse, ZmEvent } from '@/types';
import { eventsToCsv } from './eventsCsv';
import { termsFromEventsSearch, type EventsSearchParams } from './eventsSearch';

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

/** Keys that mean "the operator asked for a specific set" (no last-hour default). */
const FILTER_KEYS: (keyof EventsSearchParams)[] = [
  'monitor_id', 'group', 'cause', 'archived', 'start', 'end', 'notes', 'tag', 'q',
];

export interface EventsListPageState {
  isAuthenticated: boolean;
  accessToken: string | null;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  refetch: () => void;

  /** Events on the current page after client-side search/cause/notes/tag filters. */
  events: ZmEvent[];
  /** Rows the server sent for this page, before page-local narrowing. */
  pageRowCount: number;
  total: number;
  monitors: Monitor[];
  monitorLookup: Record<number, string>;
  groups: Group[];
  storageLookup: Record<number, string>;
  storageName: (storageId: number) => string;
  tags: Tag[];
  /** Distinct causes on the fetched page (plus the active filter, if any). */
  causes: string[];
  /** Σ duration / Σ disk across the visible page. */
  totals: { duration: number; disk: number };
  /** True when a filter only narrows the fetched page (search / cause / notes / tag). */
  pageLocalFiltering: boolean;

  searchQuery: string;
  setSearchQuery: (v: string) => void;
  notesQuery: string;
  setNotesQuery: (v: string) => void;
  monitorFilter: number | 'all';
  setMonitorFilter: (v: number | 'all') => void;
  groupFilter: number | 'all';
  setGroupFilter: (v: number | 'all') => void;
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
  /** Upper bound (`datetime-local` value) — legacy "Start Date/Time <=". */
  endInputValue: string;
  setEndInput: (v: string) => void;
  showDefaultHourHint: boolean;
  clearDefaultDateFilter: () => void;
  /** Drop every filter (legacy "reset filters" icon). */
  resetFilters: () => void;

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
  setSelected: (ids: number[], selected: boolean) => void;
  clearSelection: () => void;

  /** The active filters as ZoneMinder terms (for the "Filter" button). */
  filterTerms: FilterTerm[];
  /** Search params for `/filters` that open a new filter seeded with them. */
  filterLinkSearch: { terms: string };
  /** Download the visible page as CSV (bootstrap-table "Export"). */
  exportCsv: () => void;
}

/** Build the preview AST for a group-wide page (the events endpoint takes one monitor id). */
export function groupEventsAst(opts: {
  monitorIds: number[];
  archived?: boolean;
  startTime?: string;
  endTime?: string;
  sort: EventSortField;
  dir: SortDirection;
}): { where: FilterAstExpr; sort: { field: EventSortField; dir: SortDirection } } {
  const rules: FilterAstExpr[] = [{ field: 'monitor_id', op: 'in', value: opts.monitorIds }];
  if (opts.archived !== undefined) rules.push({ field: 'archived', op: 'eq', value: opts.archived ? 1 : 0 });
  if (opts.startTime) rules.push({ field: 'start_time', op: 'gte', value: opts.startTime });
  if (opts.endTime) rules.push({ field: 'end_time', op: 'lte', value: opts.endTime });
  return { where: { match: 'all', rules }, sort: { field: opts.sort, dir: opts.dir } };
}

/**
 * Data, filters, pagination and selection for the Events list. Skin-agnostic:
 * the modern card list and the classic table both render from this hook.
 * Every filter, the sort and the page live in the URL (`/events?…`) so
 * back/forward and shared links work; page size, default sort and
 * thumbnails follow the `ZM_WEB_*` config rows the legacy UI honours.
 */
export function useEventsListPage(): EventsListPageState {
  const { isAuthenticated, accessToken } = useAuthStore();
  const search = useSearch({ from: '/events/' }) as EventsSearchParams;
  const navigate = useNavigate({ from: '/events/' });

  const configPageSize = useZmConfig('ZM_WEB_EVENTS_PER_PAGE', 25);
  const configSortField = useZmConfig('ZM_WEB_EVENT_SORT_FIELD', 'StartDateTime');
  const configSortOrder = useZmConfig('ZM_WEB_EVENT_SORT_ORDER', 'asc');
  const showThumbs = useZmConfig('ZM_WEB_LIST_THUMBS', true);
  const configThumbWidth = useZmConfig('ZM_WEB_LIST_THUMB_WIDTH', 48);
  const thumbWidth = configThumbWidth > 0 ? configThumbWidth : 48;

  const setSearch = (patch: Partial<EventsSearchParams>) => {
    navigate({
      search: (prev: EventsSearchParams) => {
        const next: Partial<EventsSearchParams> = { ...prev, ...patch };
        (Object.keys(next) as (keyof EventsSearchParams)[]).forEach((k) => {
          if (next[k] === undefined || next[k] === '' || next[k] === null) delete next[k];
        });
        return next as EventsSearchParams;
      },
      replace: true,
    });
  };

  // Free-text boxes keep a local draft and commit to the URL shortly after
  // the operator stops typing, so every keystroke does not rewrite history.
  const [searchDraft, setSearchDraft] = useState(search.q ?? '');
  const [notesDraft, setNotesDraft] = useState(search.notes ?? '');
  useEffect(() => { setSearchDraft(search.q ?? ''); }, [search.q]);
  useEffect(() => { setNotesDraft(search.notes ?? ''); }, [search.notes]);
  useEffect(() => {
    const id = setTimeout(() => {
      if ((search.q ?? '') !== searchDraft) setSearch({ q: searchDraft || undefined, page: undefined });
    }, 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft]);
  useEffect(() => {
    const id = setTimeout(() => {
      if ((search.notes ?? '') !== notesDraft) setSearch({ notes: notesDraft || undefined, page: undefined });
    }, 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notesDraft]);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const setSelected = (ids: number[], selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (selected ? next.add(id) : next.delete(id)));
      return next;
    });
  };

  const monitorFilter: number | 'all' = search.monitor_id ?? 'all';
  const groupFilter: number | 'all' = search.group ?? 'all';
  const causeFilter = search.cause ?? 'all';
  const tagFilter: number | 'all' = search.tag ?? 'all';
  const archivedFilter: ArchivedFilter =
    search.archived === true ? 'archived' : search.archived === false ? 'unarchived' : 'all';

  // Default to "last hour" on a plain landing — matches legacy ZM behaviour.
  // A URL that already names a filter on arrival asks for that set, not
  // "that set within the last hour", so it starts unbounded. Filters added
  // afterwards narrow within the hour, as legacy's prefilled term does; the
  // Clear link (or a reset) dismisses the default for this visit.
  const [deepLinked] = useState(() => FILTER_KEYS.some((k) => search[k] !== undefined));
  const [defaultCleared, setDefaultCleared] = useState(false);
  const [defaultLowerBound] = useState(() => defaultStartTimeLowerBound());
  const defaultDateActive = !deepLinked && !defaultCleared;
  const dateFilter = search.start
    ? dateInputToStartTime(search.start)
    : defaultDateActive ? defaultLowerBound : '';
  const endFilter = search.end ? dateInputToStartTime(search.end) : '';

  const page = search.page ?? 1;
  const pageSize = search.page_size ?? (configPageSize > 0 ? configPageSize : 25);
  const sortField = search.sort ?? legacySortFieldToApi(configSortField);
  const sortDir = search.dir ?? (configSortOrder.toLowerCase() === 'desc' ? 'desc' : 'asc');

  // Fetch monitors for filter dropdown
  const { data: monitorsData } = useQuery({
    queryKey: ['monitors'],
    queryFn: () => getMonitors({ page: 1, page_size: 100 }),
    enabled: isAuthenticated,
  });

  // Groups (legacy "Group" filter) — resolved to monitor ids client-side.
  const { data: groupsData } = useQuery({
    queryKey: ['groups'],
    queryFn: () => listGroups({ page: 1, page_size: 200 }),
    enabled: isAuthenticated,
    staleTime: 60_000,
  });
  const { data: groupMonitorsData } = useQuery({
    queryKey: ['groups-monitors'],
    queryFn: () => listGroupMonitors({ page: 1, page_size: 1000 }),
    enabled: isAuthenticated && groupFilter !== 'all',
    staleTime: 60_000,
  });
  const groups = useMemo(() => groupsData?.items ?? [], [groupsData]);
  const groupMonitorIds = useMemo(() => {
    if (groupFilter === 'all') return null;
    return (groupMonitorsData?.items ?? [])
      .filter((gm) => gm.group_id === groupFilter)
      .map((gm) => gm.monitor_id);
  }, [groupFilter, groupMonitorsData]);

  // Storage names for the Storage column; id 0 is ZoneMinder's implicit default store.
  const { data: storageData } = useQuery({
    queryKey: ['storage'],
    queryFn: () => getStorageList({ page: 1, page_size: 100 }),
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
  });
  const storageLookup = useMemo(() => {
    const out: Record<number, string> = {};
    (storageData?.items ?? []).forEach((s) => { out[s.id] = s.name; });
    return out;
  }, [storageData]);
  const storageName = (id: number) => storageLookup[id] ?? (id === 0 ? i18next.t('Default') : String(id));

  // Fetch tags for filter dropdown
  const { data: tagsData } = useQuery({
    queryKey: ['tags'],
    queryFn: () => listTags({ page: 1, page_size: 200 }),
    enabled: isAuthenticated,
  });
  const tags = tagsData?.items ?? [];

  // Fetch events. Cause is not a backend parameter, so it is not in the key.
  // A single monitor goes through `/events`; a group (several monitors) has
  // no list parameter, so it runs through `/filters/preview` with
  // `monitor_id in […]` — same paging, sort and ACLs, server-side.
  const useGroupPath = monitorFilter === 'all' && groupMonitorIds !== null;
  const groupReady = !useGroupPath || groupMonitorsData !== undefined;
  const { data: eventsData, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: [
      'events', page, pageSize, monitorFilter, groupMonitorIds, archivedFilter,
      dateFilter, endFilter, sortField, sortDir,
    ],
    queryFn: async (): Promise<PaginatedResponse<ZmEvent>> => {
      const archived = archivedFilter === 'all' ? undefined : archivedFilter === 'archived';
      if (useGroupPath) {
        if (groupMonitorIds!.length === 0) {
          return { items: [], total: 0, current_page: 1, per_page: pageSize, last_page: 1 };
        }
        return previewFilter(groupEventsAst({
          monitorIds: groupMonitorIds!, archived,
          startTime: dateFilter || undefined, endTime: endFilter || undefined,
          sort: sortField, dir: sortDir,
        }), { page, page_size: pageSize });
      }
      return getEvents({
        page,
        page_size: pageSize,
        monitor_id: monitorFilter === 'all' ? undefined : monitorFilter,
        archived,
        start_time: dateFilter || undefined,
        // Legacy "Start Date/Time <=" — the API bounds end_date_time instead,
        // so an event still running at this instant is left out.
        end_time: endFilter || undefined,
        sort: sortField,
        direction: sortDir,
      });
    },
    enabled: isAuthenticated && groupReady,
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
  const searchQuery = search.q ?? '';
  const notesQuery = search.notes ?? '';
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
  const pageLocalFiltering =
    searchQuery.trim() !== '' || notesQuery.trim() !== '' || causeFilter !== 'all' || tagFilter !== 'all';

  // Footer totals — sum across the visible page.
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

  const showDefaultHourHint = defaultDateActive;

  const clearDefaultDateFilter = () => {
    setDefaultCleared(true);
    setSearch({ page: undefined });
  };

  // Every filter change resets to page 1, as the old inline handlers did.
  const setMonitorFilter = (v: number | 'all') =>
    setSearch({ monitor_id: v === 'all' ? undefined : v, page: undefined });
  const setGroupFilter = (v: number | 'all') =>
    setSearch({ group: v === 'all' ? undefined : v, page: undefined });
  const setCauseFilter = (v: string) => setSearch({ cause: v === 'all' ? undefined : v, page: undefined });
  const setTagFilter = (v: number | 'all') => setSearch({ tag: v === 'all' ? undefined : v, page: undefined });
  const setArchivedFilter = (v: ArchivedFilter) =>
    setSearch({ archived: v === 'all' ? undefined : v === 'archived', page: undefined });
  const setDateInput = (v: string) => {
    // An explicit clear of the seeded hour is a clear, not "back to default".
    if (!v) setDefaultCleared(true);
    setSearch({ start: v || undefined, page: undefined });
  };
  const setEndInput = (v: string) => setSearch({ end: v || undefined, page: undefined });
  const resetFilters = () => {
    setDefaultCleared(true);
    setSearch({
      monitor_id: undefined, group: undefined, cause: undefined, archived: undefined,
      start: undefined, end: undefined, notes: undefined, tag: undefined, q: undefined, page: undefined,
    });
  };
  const setPageSize = (n: number) => {
    if (!Number.isFinite(n) || n <= 0) return;
    setSearch({ page_size: n, page: undefined });
  };
  const toggleSort = (field: EventSortField) => {
    setSearch(
      field === sortField
        ? { sort: field, dir: sortDir === 'asc' ? 'desc' : 'asc', page: undefined }
        : { sort: field, dir: 'asc', page: undefined },
    );
  };
  const setSortDir = (dir: SortDirection) => setSearch({ sort: sortField, dir, page: undefined });
  const setPage = (n: number) => {
    const clamped = Math.min(Math.max(1, n), Math.max(1, totalPages));
    setSearch({ page: clamped === 1 ? undefined : clamped });
  };

  const pageSizeOptions = useMemo(
    () => Array.from(new Set([...EVENTS_PAGE_SIZE_OPTIONS, pageSize])).sort((a, b) => a - b),
    [pageSize],
  );

  // The effective filter set (including the seeded last hour) as ZM terms.
  const filterTerms = useMemo(
    () => termsFromEventsSearch({
      ...search,
      start: dateFilter ? startTimeToDateInput(dateFilter) : undefined,
    }),
    [search, dateFilter],
  );
  const filterLinkSearch = useMemo(() => ({ terms: JSON.stringify(filterTerms) }), [filterTerms]);

  const hidden = useEventsColumnsStore((s) => s.hidden);
  const exportCsv = () => {
    const columns: EventsColumnKey[] = EVENTS_COLUMNS.map((c) => c.key).filter((k) => !hidden.includes(k));
    const csv = eventsToCsv(filteredEvents, columns, {
      monitorName: (id) => monitorLookup[id] ?? String(id),
      storageName,
    });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadCsv(`zm-events-${stamp}.csv`, csv);
  };

  return {
    isAuthenticated,
    accessToken,
    isLoading,
    isFetching,
    error: (error as Error | null) ?? null,
    refetch: () => { refetch(); },

    events: filteredEvents,
    pageRowCount: events.length,
    total: eventsData?.total || 0,
    monitors,
    monitorLookup,
    groups,
    storageLookup,
    storageName,
    tags,
    causes,
    totals,
    pageLocalFiltering,

    searchQuery: searchDraft,
    setSearchQuery: setSearchDraft,
    notesQuery: notesDraft,
    setNotesQuery: setNotesDraft,
    monitorFilter,
    setMonitorFilter,
    groupFilter,
    setGroupFilter,
    causeFilter,
    setCauseFilter,
    tagFilter,
    setTagFilter,
    archivedFilter,
    setArchivedFilter,
    dateFilter,
    dateInputValue: startTimeToDateInput(dateFilter),
    setDateInput,
    endInputValue: search.end ?? '',
    setEndInput,
    showDefaultHourHint,
    clearDefaultDateFilter,
    resetFilters,

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
    prevPage: () => setPage(page - 1),
    nextPage: () => setPage(page + 1),

    showThumbs,
    thumbWidth,

    selectedIds,
    toggleSelected,
    setSelected,
    clearSelection: () => setSelectedIds(new Set()),

    filterTerms,
    filterLinkSearch,
    exportCsv,
  };
}

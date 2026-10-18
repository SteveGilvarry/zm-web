import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { getAllMonitors } from '@/api/monitors';
import { listGroupMonitors } from '@/api/groups';
import { getTagDetail } from '@/api/tags';
import { previewFilter, type FilterAstExpr, type FilterAstQuery } from '@/api/filters';
import type { EventSortField } from '@/api/events';
import { getEventFrameImageUrl } from '@/api/frames';
import { useAuthStore } from '@/stores/auth';
import { groupEventsAst } from '@/features/events/useEventsListPage';
import {
  monitorIdsFromSearch,
  notesFromSearch,
  toApiTimestamp,
  type EventNavSearch,
  type EventsSearchParams,
} from '@/features/events/eventsSearch';
import { useFrameScores } from '@/features/montagereview/useFrameScores';
import type { Monitor, ZmEvent } from '@/types';
import {
  alignWindow,
  buildChart,
  formatDbTime,
  parseWhen,
  requestedWindow,
  type ActivitySlot,
  type EventSlot,
  type TimelineChart,
  type ZoomBand,
  imagePaddingTop as imagePaddingTopOf,
} from './timelineChart';
import {
  eventNavSearch,
  eventsLinkSearch,
  filterOf,
  toLocalInput,
  type TimelineSearchParams,
} from './timelineSearch';

/** zm-api's page cap; the chart reads at most `MAX_PAGES` of them. */
export const TIMELINE_PAGE_SIZE = 1000;
export const TIMELINE_MAX_PAGES = 10;
/** With no events and no filter bounds, show the last day rather than legacy's 1970. */
const EMPTY_WINDOW_SECONDS = 24 * 60 * 60;

/** What the readout above the chart shows for one monitor (`showEventData`). */
export interface TimelinePreview {
  event: ZmEvent;
  monitorName: string;
  frame: number | 'alarm';
  imageUrl: string;
}

export interface TimelinePageState {
  isAuthenticated: boolean;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  refresh: () => void;
  /** Null until the window is known. */
  chart: TimelineChart | null;
  /** More events fell in the window than the chart reads. */
  truncated: boolean;
  /** Readouts by monitor id, in chart row order. */
  previews: Array<{ monitorId: number; preview: TimelinePreview | null }>;
  /** `padding-top` for the preview image boxes (legacy `.imageHeight`). */
  imagePaddingTop: string;
  /** Hover (or click) a bar: show that event in its monitor's readout. */
  preview: (slot: EventSlot | ActivitySlot) => void;
  /** Legacy's tips sit there until the first readout replaces them. */
  showInstructions: boolean;

  zoomTo: (band: Pick<ZoomBand, 'minT' | 'maxT'>) => void;
  zoomOut: () => void;
  panLeft: () => void;
  panRight: () => void;
  /** Two `datetime-local` values; either may be blank to let the events decide. */
  setWindow: (min: string, max: string) => void;
  minInput: string;
  maxInput: string;

  /** Search for the List / Events link. */
  eventsSearch: EventsSearchParams;
  /** Search the click-through to `/events/$eventId` carries. */
  eventSearch: EventNavSearch;
  /** Navigate to the event, as clicking a bar or the readout does. */
  openEvent: (eventId: number) => void;
}

function isoOf(seconds: number): string {
  return new Date(seconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** The events filter as preview AST rules, shared by the range and the events query. */
export function timelineAst(
  filter: EventsSearchParams,
  scope: { monitorIds: number[] | null; tagEventIds?: number[] },
  sort: { field: EventSortField; dir: 'asc' | 'desc' },
): FilterAstQuery & { where: { match: 'all'; rules: FilterAstExpr[] } } {
  const q = groupEventsAst({
    monitorIds: scope.monitorIds ?? undefined,
    archived: filter.archived,
    startTime: filter.start ? toApiTimestamp(filter.start) || undefined : undefined,
    endTime: filter.end ? toApiTimestamp(filter.end) || undefined : undefined,
    name: filter.q?.trim() || undefined,
    cause: filter.cause?.trim() || undefined,
    notes: notesFromSearch(filter),
    eventIds: scope.tagEventIds,
    storageId: filter.storage,
    sort: sort.field,
    dir: sort.dir,
  });
  const out = q as FilterAstQuery & { where: { match: 'all'; rules: FilterAstExpr[] } };
  // `/filters/preview` answers 400 "filter group must contain at least one
  // rule" for an empty group, and an unfiltered timeline has nothing to say.
  // `id >= 1` matches every event and keeps the group well-formed.
  if (out.where.rules.length === 0) out.where.rules.push({ field: 'id', op: 'gte', value: 1 });
  return out;
}

/** Every event overlapping `[lo, hi]` (legacy: `EndDateTime >= min AND StartDateTime <= max`). */
export async function fetchTimelineEvents(
  base: ReturnType<typeof timelineAst>,
  lo: number,
  hi: number,
): Promise<{ events: ZmEvent[]; truncated: boolean }> {
  const ast: FilterAstQuery = {
    ...base,
    where: {
      match: 'all',
      rules: [
        ...base.where.rules,
        { field: 'start_time', op: 'lte', value: isoOf(hi) },
        { field: 'end_time', op: 'gte', value: isoOf(lo) },
      ],
    },
  };
  const events: ZmEvent[] = [];
  for (let page = 1; page <= TIMELINE_MAX_PAGES; page++) {
    const res = await previewFilter(ast, { page, page_size: TIMELINE_PAGE_SIZE });
    events.push(...res.items);
    if (res.items.length === 0 || res.current_page >= res.last_page) return { events, truncated: false };
  }
  return { events, truncated: true };
}

/** `$rangeSql`: the first start and last end among the filtered events. */
export async function fetchDataRange(
  filter: EventsSearchParams,
  scope: { monitorIds: number[] | null; tagEventIds?: number[] },
): Promise<{ minT?: number; maxT?: number }> {
  const [first, last] = await Promise.all([
    previewFilter(timelineAst(filter, scope, { field: 'start_time', dir: 'asc' }), { page: 1, page_size: 1 }),
    previewFilter(timelineAst(filter, scope, { field: 'end_time', dir: 'desc' }), { page: 1, page_size: 1 }),
  ]);
  const toT = (iso: string | null | undefined) => {
    const ms = iso ? Date.parse(iso) : NaN;
    return Number.isNaN(ms) ? undefined : Math.floor(ms / 1000);
  };
  return { minT: toT(first.items[0]?.start_date_time), maxT: toT(last.items[0]?.end_date_time) };
}

/**
 * The Timeline page (legacy `?view=timeline`): every event matching the
 * events filter over a window, drawn per monitor in its colour, with an
 * activity strip of alarm scores, click-to-zoom bands, pan / zoom out, a
 * hover readout per monitor and click-through to the event.
 */
export function useTimelinePage(): TimelinePageState {
  const { isAuthenticated, accessToken } = useAuthStore();
  const search = useSearch({ from: '/timeline/' }) as TimelineSearchParams;
  const navigate = useNavigate({ from: '/timeline/' });
  const filter = useMemo(() => filterOf(search), [search]);

  const monitorsQ = useQuery({
    queryKey: ['monitors', 'all'],
    queryFn: () => getAllMonitors(),
    enabled: isAuthenticated,
    staleTime: 60_000,
  });
  const monitors: Monitor[] = useMemo(() => monitorsQ.data ?? [], [monitorsQ.data]);

  const groupQ = useQuery({
    queryKey: ['groups-monitors'],
    queryFn: () => listGroupMonitors({ page: 1, page_size: 1000 }),
    enabled: isAuthenticated && filter.group != null,
    staleTime: 60_000,
  });
  const tagQ = useQuery({
    queryKey: ['tag-events', filter.tag],
    queryFn: () => getTagDetail(filter.tag as number, { page: 1, page_size: 1000 }),
    enabled: isAuthenticated && filter.tag != null,
    staleTime: 60_000,
  });

  const monitorIds = useMemo(() => monitorIdsFromSearch(filter), [filter]);
  const scope = useMemo(() => {
    let ids: number[] | null = monitorIds.length > 0 ? monitorIds : null;
    if (!ids && filter.group != null) {
      ids = (groupQ.data?.items ?? []).filter((gm) => gm.group_id === filter.group).map((gm) => gm.monitor_id);
    }
    return { monitorIds: ids, tagEventIds: filter.tag != null ? (tagQ.data?.events ?? []).map((e) => e.id) : undefined };
  }, [monitorIds, filter.group, filter.tag, groupQ.data, tagQ.data]);
  const scopeReady = (filter.group == null || monitorIds.length > 0 || groupQ.data !== undefined)
    && (filter.tag == null || tagQ.data !== undefined);
  const scopeEmpty = (scope.monitorIds !== null && scope.monitorIds.length === 0)
    || (scope.tagEventIds !== undefined && scope.tagEventIds.length === 0);

  const requested = useMemo(
    () => requestedWindow(search),
    [search],
  );
  const needData = requested.minT === undefined || requested.maxT === undefined;
  const rangeQ = useQuery({
    queryKey: ['timeline-range', filter, scope],
    queryFn: () => fetchDataRange(filter, scope),
    enabled: isAuthenticated && needData && scopeReady && !scopeEmpty,
    staleTime: 30_000,
  });

  const [nowT] = useState(() => Math.floor(Date.now() / 1000));
  const win = useMemo(() => {
    if (needData && !scopeEmpty && rangeQ.data === undefined) return null;
    const data = rangeQ.data ?? {};
    const maxT = requested.maxT ?? data.maxT ?? parseWhen(filter.end) ?? nowT;
    const minT = requested.minT ?? data.minT ?? parseWhen(filter.start) ?? maxT - EMPTY_WINDOW_SECONDS;
    return alignWindow(Math.min(minT, maxT), Math.max(minT, maxT), nowT);
  }, [needData, scopeEmpty, rangeQ.data, requested, filter.end, filter.start, nowT]);

  const eventsQ = useQuery({
    queryKey: ['timeline-events', filter, scope, win?.lo, win?.hi],
    queryFn: () => fetchTimelineEvents(timelineAst(filter, scope, { field: 'id', dir: 'asc' }), win!.lo, win!.hi),
    enabled: isAuthenticated && win !== null && scopeReady && !scopeEmpty,
    staleTime: 30_000,
  });
  const events = useMemo(() => eventsQ.data?.events ?? [], [eventsQ.data]);
  const { framesByEvent } = useFrameScores(events, isAuthenticated);

  // `framesByEvent` is a new Map every render, so memoising would buy nothing;
  // the layout is 600 slots per monitor and cheap.
  const chart = win ? buildChart({ window: win, events, framesByEvent, monitors, nowT }) : null;

  const [picked, setPicked] = useState<Map<number, { event: ZmEvent; frame: number | 'alarm' }>>(new Map());
  const preview = useCallback((slot: EventSlot | ActivitySlot) => {
    setPicked((prev) => new Map(prev).set(slot.event.monitor_id, { event: slot.event, frame: slot.frame }));
  }, []);

  const previews = useMemo(() => (chart?.rows ?? []).map((row) => {
    // On load each monitor shows its first event, frame 1 (`initPage`).
    const p = picked.get(row.monitorId) ?? (row.slots[0] ? { event: row.slots[0].event, frame: 1 as const } : null);
    return {
      monitorId: row.monitorId,
      preview: p ? {
        event: p.event,
        frame: p.frame,
        monitorName: row.name,
        imageUrl: getEventFrameImageUrl(p.event.id, p.frame, accessToken),
      } : null,
    };
  }), [chart, picked, accessToken]);

  const go = useCallback((win: Partial<TimelineSearchParams>) => {
    void navigate({
      search: { ...filter, ...win } as never,
      replace: true,
    });
  }, [navigate, filter]);

  const zoomTo = useCallback((band: Pick<ZoomBand, 'minT' | 'maxT'>) => {
    go({ min_time: formatDbTime(band.minT), max_time: formatDbTime(band.maxT) });
  }, [go]);
  const zoomOut = useCallback(() => {
    if (!chart) return;
    go({ mid_time: formatDbTime(chart.mid), range: Math.floor(chart.range * chart.scale.zoomout) });
  }, [go, chart]);
  const panLeft = useCallback(() => {
    if (!chart) return;
    go({ mid_time: formatDbTime(chart.lo), range: chart.range });
  }, [go, chart]);
  const panRight = useCallback(() => {
    if (!chart) return;
    go({ mid_time: formatDbTime(chart.hi), range: chart.range });
  }, [go, chart]);
  const setWindow = useCallback((min: string, max: string) => {
    const lo = parseWhen(min);
    const hi = parseWhen(max);
    go({
      min_time: lo != null ? formatDbTime(lo) : undefined,
      max_time: hi != null ? formatDbTime(hi) : undefined,
    });
  }, [go]);

  const eventSearch = useMemo(() => eventNavSearch(search), [search]);
  const openEvent = useCallback((eventId: number) => {
    void navigate({
      to: '/events/$eventId',
      params: { eventId: String(eventId) },
      search: eventSearch as never,
    });
  }, [navigate, eventSearch]);

  const refresh = useCallback(() => {
    void monitorsQ.refetch();
    if (needData) void rangeQ.refetch();
    void eventsQ.refetch();
  }, [monitorsQ, rangeQ, eventsQ, needData]);

  const error = (monitorsQ.error ?? rangeQ.error ?? eventsQ.error ?? null) as Error | null;
  const hasPreview = previews.some((p) => p.preview !== null);
  const imagePaddingTop = useMemo(() => {
    const onChart = new Set((chart?.rows ?? []).map((r) => r.monitorId));
    return imagePaddingTopOf(monitors.filter((m) => onChart.has(m.id)));
  }, [chart, monitors]);

  return {
    isAuthenticated,
    isLoading: monitorsQ.isLoading || (win === null && !error) || eventsQ.isLoading,
    isFetching: monitorsQ.isFetching || rangeQ.isFetching || eventsQ.isFetching,
    error,
    refresh,
    chart,
    truncated: eventsQ.data?.truncated ?? false,
    previews,
    imagePaddingTop,
    preview,
    showInstructions: !hasPreview,
    zoomTo,
    zoomOut,
    panLeft,
    panRight,
    setWindow,
    minInput: chart ? toLocalInput(chart.lo) : '',
    maxInput: chart ? toLocalInput(chart.hi) : '',
    eventsSearch: chart ? eventsLinkSearch(search, chart.lo, chart.hi) : filter,
    eventSearch,
    openEvent,
  };
}

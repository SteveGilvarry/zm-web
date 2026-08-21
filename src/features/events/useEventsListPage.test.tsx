import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import { useEventPlaybackStore } from '@/stores/eventPlayback';
import {
  dateInputToStartTime,
  defaultStartTimeLowerBound,
  startTimeToDateInput,
  useEventsListPage,
} from './useEventsListPage';

// The hook keeps every filter in the URL: `useSearch` reads it and
// `useNavigate` writes it. A tiny in-memory router stands in for both so
// a setter call re-renders the hook with the new search, like the real one.
let mockSearch: Record<string, unknown> = {};
type SearchUpdater = Record<string, unknown> | ((prev: Record<string, unknown>) => Record<string, unknown>);
const SearchCtx = createContext<{
  search: Record<string, unknown>;
  set: (u: SearchUpdater) => void;
}>({ search: {}, set: () => {} });
vi.mock('@tanstack/react-router', () => ({
  useSearch: () => useContext(SearchCtx).search,
  useNavigate: () => {
    const { set } = useContext(SearchCtx);
    return ({ search }: { search: SearchUpdater }) => set(search);
  },
}));

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', user: null, isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  server.resetHandlers();
  mockSearch = {};
});
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

function wrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) => {
    const [search, setSearch] = useState(mockSearch);
    const set = (u: SearchUpdater) => setSearch((prev) => (typeof u === 'function' ? u(prev) : u));
    return (
      <SearchCtx.Provider value={{ search, set }}>
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      </SearchCtx.Provider>
    );
  };
}

function event(id: number, over: Record<string, unknown> = {}) {
  return {
    id, monitor_id: 1, name: `Event ${id}`, cause: 'Motion',
    start_date_time: '2026-06-03T12:00:00Z', end_date_time: '2026-06-03T12:00:30Z',
    width: 1920, height: 1080, length: 30, frames: 100, alarm_frames: 5,
    tot_score: 0, avg_score: 0, max_score: 0, archived: 0, videoed: 1,
    uploaded: 0, emailed: 0, messaged: 0, executed: 0, notes: null, state_id: 1,
    orientation: 'Rotate0', disk_space: 1_048_576, scheme: 'Medium', locked: 0,
    tags: [], storage_id: 1, ...over,
  };
}

// Values the dev box reports; individual tests override via `configs`.
const DEFAULT_CONFIGS: Record<string, string> = {
  ZM_WEB_EVENTS_PER_PAGE: '25',
  ZM_WEB_EVENT_SORT_FIELD: 'StartDateTime',
  ZM_WEB_EVENT_SORT_ORDER: 'asc',
  ZM_WEB_LIST_THUMBS: '1',
  ZM_WEB_LIST_THUMB_WIDTH: '48',
};

/** Query strings of every /events request, for asserting what hit the server. */
let eventRequests: URLSearchParams[] = [];

function stub(
  events = [event(1), event(2, { cause: 'Continuous', notes: 'parcel' })],
  configs: Record<string, string> = {},
) {
  eventRequests = [];
  const cfg = { ...DEFAULT_CONFIGS, ...configs };
  server.use(
    http.get('/api/v3/events', ({ request }) => {
      eventRequests.push(new URL(request.url).searchParams);
      return HttpResponse.json({
        items: events, total: events.length, per_page: 20, current_page: 1, last_page: 3,
      });
    }),
    http.get('/api/v3/configs/:name', ({ params }) => {
      const name = String(params.name);
      return name in cfg
        ? HttpResponse.json({ name, value: cfg[name], type: 'string' })
        : HttpResponse.json({ kind: 'NOT_FOUND' }, { status: 404 });
    }),
    http.get('/api/v3/monitors', () =>
      HttpResponse.json({
        items: [{ id: 1, name: 'Front Door' }], total: 1, per_page: 100, current_page: 1, last_page: 1,
      }),
    ),
    http.get('/api/v3/tags', () =>
      HttpResponse.json({ items: [], total: 0, per_page: 200, current_page: 1, last_page: 1 }),
    ),
    http.get('/api/v3/groups', () =>
      HttpResponse.json({
        items: [{ id: 3, name: 'Front Yard' }], total: 1, per_page: 200, current_page: 1, last_page: 1,
      }),
    ),
    http.get('/api/v3/groups-monitors', () =>
      HttpResponse.json({
        items: [{ id: 1, group_id: 3, monitor_id: 1 }, { id: 2, group_id: 3, monitor_id: 2 }],
        total: 2, per_page: 1000, current_page: 1, last_page: 1,
      }),
    ),
    http.get('/api/v3/storage', () =>
      HttpResponse.json({
        items: [{ id: 1, name: 'Default', path: '/var/cache/zoneminder/events', type: 'local', enabled: 1 }],
        total: 1, per_page: 100, current_page: 1, last_page: 1,
      }),
    ),
  );
}

describe('defaultStartTimeLowerBound / dateInputToStartTime', () => {
  it('returns now-1h as a seconds-precision ISO string', () => {
    const now = new Date('2026-06-03T12:34:56.789Z');
    expect(defaultStartTimeLowerBound(now)).toBe('2026-06-03T11:34:56Z');
  });

  it('reads date and datetime-local inputs as local wall-clock time', () => {
    expect(dateInputToStartTime('')).toBe('');
    const localMidnight = new Date('2026-06-03T00:00').toISOString().replace(/\.\d{3}Z$/, 'Z');
    expect(dateInputToStartTime('2026-06-03')).toBe(localMidnight);
    const localAfternoon = new Date('2026-06-03T14:30').toISOString().replace(/\.\d{3}Z$/, 'Z');
    expect(dateInputToStartTime('2026-06-03T14:30')).toBe(localAfternoon);
    expect(dateInputToStartTime('not a date')).toBe('');
  });

  it('passes timestamps that already carry a zone through unchanged', () => {
    expect(dateInputToStartTime('2026-06-03T05:00:00Z')).toBe('2026-06-03T05:00:00Z');
    expect(dateInputToStartTime('2026-06-03T05:00:00+10:00')).toBe('2026-06-03T05:00:00+10:00');
  });

  it('round-trips through the datetime-local input value', () => {
    const iso = dateInputToStartTime('2026-06-03T14:30');
    expect(startTimeToDateInput(iso)).toBe('2026-06-03T14:30');
    expect(startTimeToDateInput('')).toBe('');
  });
});

describe('useEventsListPage', () => {
  it('loads events, builds the monitor lookup and causes, and shows the last-hour hint', async () => {
    stub();
    const { result } = renderHook(() => useEventsListPage(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.events).toHaveLength(2));
    expect(result.current.total).toBe(2);
    expect(result.current.totalPages).toBe(3);
    expect(result.current.monitorLookup).toEqual({ 1: 'Front Door' });
    expect(result.current.causes).toEqual(['Continuous', 'Motion']);
    expect(result.current.totals.duration).toBe(60);
    expect(result.current.showDefaultHourHint).toBe(true);
  });

  it('sends the name and notes boxes to the server as query params', async () => {
    stub();
    const { result } = renderHook(() => useEventsListPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.events).toHaveLength(2));
    expect(eventRequests[0].has('name')).toBe(false);

    act(() => result.current.setSearchQuery('continuous'));
    // Free text is committed to the URL after a short pause, then refetched.
    await waitFor(() => expect(eventRequests.at(-1)!.get('name')).toBe('continuous'));
    // Narrowing further keeps the seeded hour (legacy keeps its prefilled term too).
    expect(result.current.showDefaultHourHint).toBe(true);
    // Nothing is dropped locally: the page is whatever the server answered.
    expect(result.current.events).toHaveLength(2);

    act(() => result.current.setSearchQuery(''));
    act(() => result.current.setNotesQuery('parcel'));
    await waitFor(() => expect(eventRequests.at(-1)!.get('notes')).toBe('parcel'));
    expect(eventRequests.at(-1)!.has('name')).toBe(false);
  });

  it('sends the tag filter as tag_id', async () => {
    mockSearch = { tag: 4 };
    stub();
    renderHook(() => useEventsListPage(), { wrapper: wrapper() });
    await waitFor(() => expect(eventRequests).toHaveLength(1));
    expect(eventRequests[0].get('tag_id')).toBe('4');
  });

  it('runs a group filter through /filters/preview with the group\'s monitor ids', async () => {
    mockSearch = { group: 3 };
    stub();
    let previewBody: Record<string, unknown> | null = null;
    server.use(
      http.post('/api/v3/filters/preview', async ({ request }) => {
        previewBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          items: [event(9)], total: 1, per_page: 25, current_page: 1, last_page: 1,
        });
      }),
    );
    const { result } = renderHook(() => useEventsListPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.events.map((e) => e.id)).toEqual([9]));
    expect(previewBody).toEqual({
      where: { match: 'all', rules: [{ field: 'monitor_id', op: 'in', value: [1, 2] }] },
      sort: { field: 'start_time', dir: 'asc' },
    });
    expect(eventRequests).toHaveLength(0);
  });

  it('pushes the substring filters into the group preview AST as LIKE rules', async () => {
    mockSearch = { group: 3, q: 'door', cause: 'Motion', notes: 'parcel' };
    stub();
    let previewBody: Record<string, unknown> | null = null;
    server.use(
      http.post('/api/v3/filters/preview', async ({ request }) => {
        previewBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          items: [event(9)], total: 1, per_page: 25, current_page: 1, last_page: 1,
        });
      }),
    );
    const { result } = renderHook(() => useEventsListPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.events.map((e) => e.id)).toEqual([9]));
    expect((previewBody as unknown as { where: { rules: unknown[] } }).where.rules).toEqual([
      { field: 'monitor_id', op: 'in', value: [1, 2] },
      { field: 'name', op: 'like', value: '%door%' },
      { field: 'cause', op: 'like', value: '%Motion%' },
      { field: 'notes', op: 'like', value: '%parcel%' },
    ]);
  });

  it('resolves a tag to event ids on the group path, where the AST has no tag field', async () => {
    mockSearch = { group: 3, tag: 4 };
    stub();
    let previewBody: Record<string, unknown> | null = null;
    server.use(
      http.get('/api/v3/tags/4', () => HttpResponse.json({
        id: 4, name: 'review', events: [{ id: 9, monitor_id: 1, name: 'Event 9' }],
        total_events: 1, current_page: 1, last_page: 1, per_page: 1000,
      })),
      http.post('/api/v3/filters/preview', async ({ request }) => {
        previewBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          items: [event(9)], total: 1, per_page: 25, current_page: 1, last_page: 1,
        });
      }),
    );
    const { result } = renderHook(() => useEventsListPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.events.map((e) => e.id)).toEqual([9]));
    expect((previewBody as unknown as { where: { rules: unknown[] } }).where.rules).toContainEqual(
      { field: 'id', op: 'in', value: [9] },
    );
  });

  it('exposes the active filters as ZoneMinder terms for the Filter button', async () => {
    mockSearch = { monitor_id: 7, archived: true };
    stub();
    const { result } = renderHook(() => useEventsListPage(), { wrapper: wrapper() });
    expect(result.current.filterTerms).toEqual([
      { obr: '0', attr: 'MonitorId', op: '=', val: '7', cbr: '0' },
      { cnj: 'and', obr: '0', attr: 'Archived', op: '=', val: '1', cbr: '0' },
    ]);
    expect(JSON.parse(result.current.filterLinkSearch.terms)).toHaveLength(2);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('seeds monitor and cause filters from the route search params', async () => {
    mockSearch = { monitor_id: 7, cause: 'Alarm' };
    stub();
    const { result } = renderHook(() => useEventsListPage(), { wrapper: wrapper() });
    expect(result.current.monitorFilter).toBe(7);
    expect(result.current.causeFilter).toBe('Alarm');
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('sends the cause box to the server and suggests the page\'s causes', async () => {
    stub();
    const { result } = renderHook(() => useEventsListPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.events).toHaveLength(2));

    act(() => result.current.setCauseFilter('Continuous'));
    await waitFor(() => expect(eventRequests.at(-1)!.get('cause')).toBe('Continuous'));
    // The datalist stays a suggestion list of what came back, nothing more.
    expect(result.current.causes).toEqual(['Continuous', 'Motion']);
  });

  it('widens the sort enum to the columns zm-api#20 added', async () => {
    mockSearch = { sort: 'cause', dir: 'desc' };
    stub();
    const { result } = renderHook(() => useEventsListPage(), { wrapper: wrapper() });
    await waitFor(() => expect(eventRequests).toHaveLength(1));
    expect(eventRequests[0].get('sort')).toBe('cause');
    expect(eventRequests[0].get('direction')).toBe('desc');

    act(() => result.current.toggleSort('frames'));
    await waitFor(() => expect(eventRequests.at(-1)!.get('sort')).toBe('frames'));
  });

  it('honours ?archived=true from the URL as a server-side filter, without the last-hour bound', async () => {
    mockSearch = { archived: true };
    stub();
    const { result } = renderHook(() => useEventsListPage(), { wrapper: wrapper() });
    expect(result.current.archivedFilter).toBe('archived');
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(eventRequests[0].get('archived')).toBe('true');
    // Audit's "Browse archived events" means every archived event, not the
    // ones from the last hour (on the dev box that is zero of three).
    expect(eventRequests[0].has('start_time')).toBe(false);
    expect(result.current.dateFilter).toBe('');
    expect(result.current.showDefaultHourHint).toBe(false);
  });

  it('takes page size and default sort from the ZM_WEB_* config rows', async () => {
    stub(undefined, {
      ZM_WEB_EVENTS_PER_PAGE: '50',
      ZM_WEB_EVENT_SORT_FIELD: 'MaxScore',
      ZM_WEB_EVENT_SORT_ORDER: 'desc',
      ZM_WEB_LIST_THUMBS: '0',
    });
    const { result } = renderHook(() => useEventsListPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.pageSize).toBe(50));
    await waitFor(() => expect(result.current.sortField).toBe('max_score'));
    expect(result.current.sortDir).toBe('desc');
    expect(result.current.showThumbs).toBe(false);
    await waitFor(() => {
      const last = eventRequests[eventRequests.length - 1];
      expect(last.get('page_size')).toBe('50');
      expect(last.get('sort')).toBe('max_score');
      expect(last.get('direction')).toBe('desc');
    });
  });

  it('toggles sort direction on the same header and resets on a new one', async () => {
    stub();
    const { result } = renderHook(() => useEventsListPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.sortField).toBe('start_time'));

    act(() => result.current.toggleSort('start_time'));
    expect(result.current.sortDir).toBe('desc');
    act(() => result.current.toggleSort('id'));
    expect(result.current.sortField).toBe('id');
    expect(result.current.sortDir).toBe('asc');

    act(() => result.current.setPage(2));
    act(() => result.current.setPageSize(100));
    expect(result.current.pageSize).toBe(100);
    expect(result.current.page).toBe(1);
    expect(result.current.pageSizeOptions).toEqual([5, 10, 25, 50, 100, 200, 500]);
  });

  it('publishes the monitor filter as the detail page\'s prev/next scope', async () => {
    stub();
    const { result } = renderHook(() => useEventsListPage(), { wrapper: wrapper() });
    await waitFor(() => expect(useEventPlaybackStore.getState().navScope).toEqual({ monitorId: null }));
    act(() => result.current.setMonitorFilter(4));
    expect(useEventPlaybackStore.getState().navScope).toEqual({ monitorId: 4 });
  });

  it('resets to page 1 when a filter changes and toggles selection', async () => {
    stub();
    const { result } = renderHook(() => useEventsListPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.events).toHaveLength(2));

    act(() => result.current.setPage(3));
    expect(result.current.page).toBe(3);
    act(() => result.current.setArchivedFilter('archived'));
    expect(result.current.page).toBe(1);

    act(() => result.current.toggleSelected(1));
    expect(result.current.selectedIds.has(1)).toBe(true);
    act(() => result.current.toggleSelected(1));
    expect(result.current.selectedIds.size).toBe(0);

    act(() => result.current.clearDefaultDateFilter());
    expect(result.current.dateFilter).toBe('');
    expect(result.current.showDefaultHourHint).toBe(false);
  });
});

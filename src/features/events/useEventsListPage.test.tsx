import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import { useEventPlaybackStore } from '@/stores/eventPlayback';
import {
  dateInputToStartTime,
  defaultStartTimeLowerBound,
  startTimeToDateInput,
  useEventsListPage,
} from './useEventsListPage';

// The hook seeds its monitor/cause filters from the route's search params.
let mockSearch: Record<string, unknown> = {};
vi.mock('@tanstack/react-router', () => ({
  useSearch: () => mockSearch,
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
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
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

  it('filters client-side by search text and notes, and hides the hint once a filter is applied', async () => {
    stub();
    const { result } = renderHook(() => useEventsListPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.events).toHaveLength(2));

    act(() => result.current.setSearchQuery('continuous'));
    expect(result.current.events.map((e) => e.id)).toEqual([2]);
    expect(result.current.showDefaultHourHint).toBe(false);

    act(() => result.current.setSearchQuery(''));
    act(() => result.current.setNotesQuery('parcel'));
    expect(result.current.events.map((e) => e.id)).toEqual([2]);
  });

  it('seeds monitor and cause filters from the route search params', async () => {
    mockSearch = { monitor_id: 7, cause: 'Alarm' };
    stub();
    const { result } = renderHook(() => useEventsListPage(), { wrapper: wrapper() });
    expect(result.current.monitorFilter).toBe(7);
    expect(result.current.causeFilter).toBe('Alarm');
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('filters by cause client-side and keeps the chosen cause in the options', async () => {
    stub();
    const { result } = renderHook(() => useEventsListPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.events).toHaveLength(2));

    act(() => result.current.setCauseFilter('Continuous'));
    expect(result.current.events.map((e) => e.id)).toEqual([2]);
    // Cause never goes to the server — it is not a backend parameter.
    expect(eventRequests.every((q) => !q.has('cause'))).toBe(true);

    act(() => result.current.setCauseFilter('Linked'));
    expect(result.current.events).toEqual([]);
    expect(result.current.causes).toEqual(['Continuous', 'Linked', 'Motion']);
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

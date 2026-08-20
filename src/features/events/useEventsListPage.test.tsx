import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import {
  dateInputToStartTime,
  defaultStartTimeLowerBound,
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

function stub(events = [event(1), event(2, { cause: 'Continuous', notes: 'parcel' })]) {
  server.use(
    http.get('/api/v3/events', () =>
      HttpResponse.json({
        items: events, total: events.length, per_page: 20, current_page: 1, last_page: 3,
      }),
    ),
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

  it('expands a date input to start-of-day UTC and passes full timestamps through', () => {
    expect(dateInputToStartTime('')).toBe('');
    expect(dateInputToStartTime('2026-06-03')).toBe('2026-06-03T00:00:00Z');
    expect(dateInputToStartTime('2026-06-03T05:00:00Z')).toBe('2026-06-03T05:00:00Z');
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

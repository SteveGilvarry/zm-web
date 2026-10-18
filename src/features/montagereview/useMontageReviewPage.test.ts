import { describe, expect, it, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import { useMontageStore, useReviewRangeStore } from '@/stores/montage';
import { DEFAULT_REVIEW_FILTERS } from './useReviewEvents';
import {
  presetToRange,
  reviewGridColumns,
  useMontageReviewPage,
} from './useMontageReviewPage';

vi.mock('@tanstack/react-router', () => ({
  useSearch: () => ({}),
  useNavigate: () => vi.fn(),
}));

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', user: null, isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
// The window and the event filters persist (legacy cookies); start each test
// from nothing stored.
beforeEach(() => {
  useReviewRangeStore.setState({ range: null });
  useMontageStore.setState({ reviewFilters: DEFAULT_REVIEW_FILTERS });
});

afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

const monitors = [
  { id: 1, name: 'Front', capturing: 'Always' },
  { id: 2, name: 'Back', capturing: 'Always' },
  { id: 3, name: 'Off', capturing: 'None' },
];

function stubMonitors() {
  server.use(
    http.get('/api/v3/monitors', () =>
      HttpResponse.json({ items: monitors, total: 3, per_page: 100, current_page: 1, last_page: 1 }),
    ),
  );
}

describe('presetToRange / reviewGridColumns', () => {
  it('maps presets to ranges ending now (live starts now)', () => {
    const now = new Date('2026-08-21T12:00:00Z');
    expect(presetToRange('1h', now)).toEqual({ start: new Date('2026-08-21T11:00:00Z'), end: now });
    expect(presetToRange('8h', now).start).toEqual(new Date('2026-08-21T04:00:00Z'));
    expect(presetToRange('24h', now).start).toEqual(new Date('2026-08-20T12:00:00Z'));
    expect(presetToRange('all', now).start).toEqual(new Date('2026-07-22T12:00:00Z'));
    expect(presetToRange('live', now)).toEqual({ start: now, end: new Date('2026-08-21T13:00:00Z') });
  });

  it('picks grid columns by cell count', () => {
    expect(reviewGridColumns(0)).toBe(1);
    expect(reviewGridColumns(1)).toBe(1);
    expect(reviewGridColumns(4)).toBe(2);
    expect(reviewGridColumns(9)).toBe(3);
    expect(reviewGridColumns(10)).toBe(4);
  });
});

describe('useMontageReviewPage', () => {
  it('with nothing stored, opens on the last hour, paused (montagereview.php:103-116)', () => {
    stubMonitors();
    const { result } = renderHook(() => useMontageReviewPage(), { wrapper: makeWrapper() });
    expect(result.current.preset).toBe('1h');
    expect(result.current.isLive).toBe(false);
    expect(result.current.clock.isPlaying).toBe(false);
    expect(result.current.clock.rangeEnd.getTime() - result.current.clock.rangeStart.getTime())
      .toBe(60 * 60 * 1000);
  });

  it('reopens on the window this session last used', () => {
    stubMonitors();
    const first = renderHook(() => useMontageReviewPage(), { wrapper: makeWrapper() });
    const start = new Date('2026-08-21T02:00:00Z');
    const end = new Date('2026-08-21T05:00:00Z');
    act(() => first.result.current.setCustomRange(start, end));
    expect(useReviewRangeStore.getState().range)
      .toEqual({ start: start.toISOString(), end: end.toISOString() });
    first.unmount();

    const second = renderHook(() => useMontageReviewPage(), { wrapper: makeWrapper() });
    expect(second.result.current.preset).toBe('custom');
    expect(second.result.current.clock.rangeStart).toEqual(start);
    expect(second.result.current.clock.rangeEnd).toEqual(end);
  });

  it('keeps the window in sessionStorage, as legacy scopes its date cookies to the session', () => {
    stubMonitors();
    const { result } = renderHook(() => useMontageReviewPage(), { wrapper: makeWrapper() });
    act(() => result.current.setPreset('8h'));
    const raw = JSON.parse(window.sessionStorage.getItem('zm-review-range') ?? '{}');
    expect(new Date(raw.state.range.end).getTime() - new Date(raw.state.range.start).getTime())
      .toBe(8 * 60 * 60 * 1000);
  });

  it('does not store a window while live', () => {
    stubMonitors();
    const { result } = renderHook(() => useMontageReviewPage(), { wrapper: makeWrapper() });
    const stored = useReviewRangeStore.getState().range;
    act(() => result.current.setPreset('live'));
    expect(useReviewRangeStore.getState().range).toEqual(stored);
  });

  it('a stored window that does not parse falls back to the last hour', () => {
    useReviewRangeStore.setState({ range: { start: 'nonsense', end: '2026-08-21T05:00:00Z' } });
    stubMonitors();
    const { result } = renderHook(() => useMontageReviewPage(), { wrapper: makeWrapper() });
    expect(result.current.preset).toBe('1h');
  });

  it('keeps Archived / Tags / Notes across visits', () => {
    stubMonitors();
    const first = renderHook(() => useMontageReviewPage(), { wrapper: makeWrapper() });
    act(() => first.result.current.setFilters({ archived: 'archived', tagIds: [0, 3], notes: ['Motion'] }));
    first.unmount();

    const second = renderHook(() => useMontageReviewPage(), { wrapper: makeWrapper() });
    expect(second.result.current.filters).toEqual({ archived: 'archived', tagIds: [0, 3], notes: ['Motion'] });
    const raw = JSON.parse(window.localStorage.getItem('zm-montage') ?? '{}');
    expect(raw.state.reviewFilters).toEqual({ archived: 'archived', tagIds: [0, 3], notes: ['Motion'] });
  });

  it('selects every capturing monitor once the filter bar reports, and toggles chips', async () => {
    stubMonitors();
    const { result } = renderHook(() => useMontageReviewPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.allMonitors).toHaveLength(3));
    // Before the filter bar reports, every capturing monitor is offered.
    expect(result.current.enabled.map((m) => m.id)).toEqual([1, 2]);

    act(() => result.current.setFilteredMonitors(result.current.allMonitors));
    expect(result.current.enabled.map((m) => m.id)).toEqual([1, 2]);
    await waitFor(() => expect(result.current.selectedMonitors.map((m) => m.id)).toEqual([1, 2]));

    act(() => result.current.toggleMonitor(1));
    expect(result.current.selectedMonitors.map((m) => m.id)).toEqual([2]);
    act(() => result.current.toggleMonitor(1));
    expect(result.current.selectedMonitors.map((m) => m.id)).toEqual([1, 2]);
  });

  it('re-ranges the clock on preset change and pauses for live', () => {
    stubMonitors();
    const { result } = renderHook(() => useMontageReviewPage(), { wrapper: makeWrapper() });

    act(() => result.current.setPreset('1h'));
    expect(result.current.clock.rangeEnd.getTime() - result.current.clock.rangeStart.getTime())
      .toBe(60 * 60 * 1000);
    expect(result.current.clock.currentTime).toEqual(result.current.clock.rangeStart);

    act(() => result.current.setPreset('live'));
    expect(result.current.isLive).toBe(true);
    expect(result.current.clock.isPlaying).toBe(false);
  });
});

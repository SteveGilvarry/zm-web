/**
 * The Review page state that `useMontageReviewPage.test.ts` doesn't reach:
 * the translated preset list, custom ranges, pan/zoom, the URL-driven
 * preselection, and the backend-down branches.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';

let mockSearch: Record<string, unknown> = {};
vi.mock('@tanstack/react-router', () => ({
  useSearch: () => mockSearch,
  useNavigate: () => vi.fn(),
}));

const {
  panRange,
  parseLegacyTime,
  presetToRange,
  useMontageReviewPage,
  useReviewRangePresets,
  zoomRange,
  REVIEW_RANGE_PRESETS,
  REVIEW_SPEEDS,
  reviewSpeedIndex,
  parseZoomParams,
} = await import('./useMontageReviewPage');

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

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

const monitors = [
  { id: 1, name: 'Front', capturing: 'Always' },
  { id: 2, name: 'Back', capturing: 'Always' },
  { id: 3, name: 'Off', capturing: 'None' },
];

function stubMonitors(items: unknown[] = monitors) {
  server.use(
    http.get('/api/v3/monitors', () =>
      HttpResponse.json({ items, total: items.length, per_page: 100, current_page: 1, last_page: 1 }),
    ),
  );
}

describe('pure range helpers', () => {
  it('exposes the preset ids in legacy order and the speed ladder', () => {
    expect(REVIEW_RANGE_PRESETS.map((p) => p.value)).toEqual(['1h', '8h', '24h', 'all', 'live']);
    // Legacy's 13-step slider, 0 = paused (montagereview.php:254).
    expect(REVIEW_SPEEDS).toEqual([0, 0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 5, 10, 20, 50]);
    // The slider snaps an off-list speed (an old cookie) to the nearest step.
    expect(reviewSpeedIndex(1)).toBe(5);
    expect(reviewSpeedIndex(0)).toBe(0);
    expect(reviewSpeedIndex(2.9)).toBe(REVIEW_SPEEDS.indexOf(3));
    // A tie keeps the lower step.
    expect(reviewSpeedIndex(4)).toBe(REVIEW_SPEEDS.indexOf(3));
  });

  it('translates the preset labels through the active catalogue', () => {
    const { result } = renderHook(() => useReviewRangePresets());
    expect(result.current.map((p) => p.label))
      .toEqual(['1 hour', '8 hours', '24 hours', 'All events', 'Live']);
    expect(result.current.find((p) => p.value === 'live')?.icon).toBe('live');
  });

  it("'custom' resolves to the last hour so a half-built range is never empty", () => {
    const now = new Date('2026-08-21T12:00:00Z');
    expect(presetToRange('custom', now))
      .toEqual({ start: new Date('2026-08-21T11:00:00Z'), end: now });
  });

  it('parses legacy `YYYY-MM-DD HH:MM(:SS)` and ISO, rejecting anything else', () => {
    expect(parseLegacyTime('2026-08-21 06:37:03')?.getHours()).toBe(6);
    expect(parseLegacyTime('2026-08-21 06:37')?.getMinutes()).toBe(37);
    expect(parseLegacyTime('2026-08-21T06:37:03Z')?.toISOString())
      .toBe('2026-08-21T06:37:03.000Z');
    expect(parseLegacyTime('garbage')).toBeNull();
    expect(parseLegacyTime(undefined)).toBeNull();
    expect(parseLegacyTime('')).toBeNull();
  });

  it('pans the window by a fraction of its own width, in both directions', () => {
    const start = new Date('2026-08-21T00:00:00Z');
    const end = new Date('2026-08-21T12:00:00Z');
    expect(panRange(start, end, 0.5)).toEqual({
      start: new Date('2026-08-21T06:00:00Z'), end: new Date('2026-08-21T18:00:00Z'),
    });
    expect(panRange(start, end, -0.25)).toEqual({
      start: new Date('2026-08-20T21:00:00Z'), end: new Date('2026-08-21T09:00:00Z'),
    });
  });

  it('zooms around a fixed point and refuses to collapse under a minute', () => {
    const start = new Date('2026-08-21T00:00:00Z');
    const end = new Date('2026-08-21T12:00:00Z');
    const mid = new Date('2026-08-21T06:00:00Z');

    expect(zoomRange(start, end, 0.5, mid)).toEqual({
      start: new Date('2026-08-21T03:00:00Z'), end: new Date('2026-08-21T09:00:00Z'),
    });
    expect(zoomRange(start, end, 2, mid)).toEqual({
      start: new Date('2026-08-20T18:00:00Z'), end: new Date('2026-08-21T18:00:00Z'),
    });

    // 12 h × 0.00001 is well under a minute — the range is returned untouched.
    expect(zoomRange(start, end, 0.00001, mid)).toEqual({ start, end });
  });
});

describe('useMontageReviewPage — custom range, pan and zoom', () => {
  it('setPreset("custom") leaves the range where it is', () => {
    stubMonitors();
    const { result } = renderHook(() => useMontageReviewPage(), { wrapper: makeWrapper() });
    const before = result.current.clock.rangeStart;

    act(() => result.current.setPreset('custom'));
    expect(result.current.preset).toBe('custom');
    expect(result.current.clock.rangeStart).toBe(before);
  });

  it('setCustomRange re-ranges the clock, parks the playhead at the start and flips to custom', () => {
    stubMonitors();
    const { result } = renderHook(() => useMontageReviewPage(), { wrapper: makeWrapper() });
    // Inside the default 24 h window, so the clock's clamp is a no-op.
    const start = new Date(Date.now() - 3 * 3600_000);
    const end = new Date(Date.now() - 1 * 3600_000);

    act(() => result.current.setCustomRange(start, end));
    expect(result.current.preset).toBe('custom');
    expect(result.current.clock.rangeStart).toEqual(start);
    expect(result.current.clock.rangeEnd).toEqual(end);
    expect(result.current.clock.currentTime).toEqual(start);
  });

  // Regression (F-25): `applyRange` used to call `clock.setRange` and then
  // `clock.setCurrentTime` in the same tick, and the second call clamped
  // against the range React had not committed yet. Jumping to a window that
  // did not overlap the current one pinned the playhead to the OLD range's
  // edge. The clock now takes the playhead in the same call as the bounds.
  it('parks the playhead at the start of a window that does not overlap the current one', () => {
    stubMonitors();
    const { result } = renderHook(() => useMontageReviewPage(), { wrapper: makeWrapper() });
    const previousStart = result.current.clock.rangeStart;
    const start = new Date('2026-01-02T03:00:00Z');
    const end = new Date('2026-01-02T05:00:00Z');

    act(() => result.current.setCustomRange(start, end));
    expect(result.current.clock.rangeStart).toEqual(start);
    expect(result.current.clock.rangeEnd).toEqual(end);
    expect(result.current.clock.currentTime).toEqual(start);
    expect(result.current.clock.currentTime).not.toEqual(previousStart);
  });

  it('setCustomRange ignores an inverted or zero-width window', () => {
    stubMonitors();
    const { result } = renderHook(() => useMontageReviewPage(), { wrapper: makeWrapper() });
    const before = result.current.clock.rangeStart;

    act(() => result.current.setCustomRange(new Date('2026-01-02T05:00:00Z'), new Date('2026-01-02T03:00:00Z')));
    expect(result.current.preset).toBe('24h');
    expect(result.current.clock.rangeStart).toBe(before);

    act(() => result.current.setCustomRange(new Date('2026-01-02T05:00:00Z'), new Date('2026-01-02T05:00:00Z')));
    expect(result.current.preset).toBe('24h');
  });

  it('pan slides the window and re-clamps the playhead into it', () => {
    stubMonitors();
    const { result } = renderHook(() => useMontageReviewPage(), { wrapper: makeWrapper() });
    const start = new Date(Date.now() - 3 * 3600_000);
    const end = new Date(Date.now() - 1 * 3600_000);
    act(() => result.current.setCustomRange(start, end));

    act(() => result.current.pan(0.5));   // slide forward by half the 2 h span
    expect(result.current.preset).toBe('custom');
    expect(result.current.clock.rangeStart).toEqual(new Date(start.getTime() + 3600_000));
    expect(result.current.clock.rangeEnd).toEqual(new Date(end.getTime() + 3600_000));
    // The playhead sat on the old start, which is now behind the window.
    expect(result.current.clock.currentTime).toEqual(new Date(start.getTime() + 3600_000));
  });

  it('pan accepts a negative fraction to walk backwards', () => {
    stubMonitors();
    const { result } = renderHook(() => useMontageReviewPage(), { wrapper: makeWrapper() });
    const start = new Date(Date.now() - 3 * 3600_000);
    const end = new Date(Date.now() - 1 * 3600_000);
    act(() => result.current.setCustomRange(start, end));

    act(() => result.current.pan(-0.5));
    expect(result.current.clock.rangeStart).toEqual(new Date(start.getTime() - 3600_000));
    expect(result.current.clock.rangeEnd).toEqual(new Date(end.getTime() - 3600_000));
  });

  it('zoom narrows the window around the playhead and marks the preset custom', () => {
    stubMonitors();
    const { result } = renderHook(() => useMontageReviewPage(), { wrapper: makeWrapper() });
    const start = new Date(Date.now() - 4 * 3600_000);
    const end = new Date(Date.now());
    act(() => result.current.setCustomRange(start, end));
    const mid = new Date(start.getTime() + 2 * 3600_000);
    act(() => result.current.clock.setCurrentTime(mid));

    act(() => result.current.zoom(0.5));
    expect(result.current.preset).toBe('custom');
    expect(result.current.clock.rangeStart).toEqual(new Date(mid.getTime() - 3600_000));
    expect(result.current.clock.rangeEnd).toEqual(new Date(mid.getTime() + 3600_000));
  });

  it('zoom refuses to collapse the window below a minute', () => {
    stubMonitors();
    const { result } = renderHook(() => useMontageReviewPage(), { wrapper: makeWrapper() });
    const start = new Date(Date.now() - 4 * 3600_000);
    const end = new Date(Date.now());
    act(() => result.current.setCustomRange(start, end));

    act(() => result.current.zoom(0.000001));
    expect(result.current.clock.rangeStart).toEqual(start);
    expect(result.current.clock.rangeEnd).toEqual(end);
  });

  it('carries the scale slider', () => {
    stubMonitors();
    const { result } = renderHook(() => useMontageReviewPage(), { wrapper: makeWrapper() });
    expect(result.current.scale).toBe(1);
    act(() => result.current.setScale(0.4));
    expect(result.current.scale).toBe(0.4);
  });
});

describe('parseZoomParams', () => {
  it('reads only `z<id>` keys with a usable scale', () => {
    expect(parseZoomParams({ z1: '1.2', z2: 2, zoom: '3', z3: '-1', other: 'x' }))
      .toEqual({ 1: 1.2, 2: 2 });
  });
});

describe('useMontageReviewPage — URL search params', () => {
  it('a min_time/max_time pair opens as a custom range', () => {
    mockSearch = { min_time: '2026-08-21 06:00:00', max_time: '2026-08-21 07:00:00' };
    stubMonitors();
    const { result } = renderHook(() => useMontageReviewPage(), { wrapper: makeWrapper() });

    expect(result.current.preset).toBe('custom');
    expect(result.current.clock.rangeEnd.getTime() - result.current.clock.rangeStart.getTime())
      .toBe(60 * 60 * 1000);
  });

  it('an inverted URL window falls back to the default 24 h', () => {
    mockSearch = { min_time: '2026-08-21 09:00:00', max_time: '2026-08-21 08:00:00' };
    stubMonitors();
    const { result } = renderHook(() => useMontageReviewPage(), { wrapper: makeWrapper() });
    expect(result.current.preset).toBe('24h');
    expect(result.current.clock.rangeEnd.getTime() - result.current.clock.rangeStart.getTime())
      .toBe(24 * 60 * 60 * 1000);
  });

  it('?monitor_id=2 preselects only that monitor', async () => {
    mockSearch = { monitor_id: 2 };
    stubMonitors();
    const { result } = renderHook(() => useMontageReviewPage(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.allMonitors).toHaveLength(3));
    expect(result.current.selectedMonitors.map((m) => m.id)).toEqual([2]);
  });

  it('honours ?live=1, ?scale=, ?speed= and ?current=', async () => {
    mockSearch = { live: '1', scale: '0.4', speed: '5', current: '2026-08-21 06:30:00' };
    stubMonitors();
    const { result } = renderHook(() => useMontageReviewPage(), { wrapper: makeWrapper() });

    expect(result.current.isLive).toBe(true);
    expect(result.current.scale).toBe(0.4);
    await waitFor(() => expect(result.current.clock.speed).toBe(5));
    // `current` alone opens a window half an hour each side of it.
    const current = new Date('2026-08-21T06:30:00');
    expect(result.current.clock.currentTime.getTime()).toBe(current.getTime());
    expect(result.current.clock.rangeStart.getTime()).toBe(current.getTime() - 1800_000);
    expect(result.current.clock.rangeEnd.getTime()).toBe(current.getTime() + 1800_000);
  });

  it('ignores a scale outside legacy\'s 0.1–1.0 slider', () => {
    mockSearch = { scale: '9' };
    stubMonitors();
    const { result } = renderHook(() => useMontageReviewPage(), { wrapper: makeWrapper() });
    expect(result.current.scale).toBe(1);
  });

  it('seeds each monitor\'s zoom from ?z<id>= and steps it by a corner click', () => {
    mockSearch = { z2: '1.5', zed: '3', z9: 'nonsense' };
    stubMonitors();
    const { result } = renderHook(() => useMontageReviewPage(), { wrapper: makeWrapper() });

    expect(result.current.monitorZoom).toEqual({ 2: 1.5 });

    act(() => result.current.zoomMonitor(2, 2));
    expect(result.current.monitorZoom[2]).toBe(3);
    // Clamped so a runaway click cannot blow the canvas up or vanish it.
    act(() => result.current.zoomMonitor(2, 100));
    expect(result.current.monitorZoom[2]).toBe(8);
    act(() => result.current.zoomMonitor(2, 0.001));
    expect(result.current.monitorZoom[2]).toBe(0.25);
  });

  it('orders the wall by the MontageSort user preference', async () => {
    stubMonitors();
    server.use(http.get('/api/v3/user_preferences', () => HttpResponse.json({
      items: [{ id: 1, user_id: 7, name: 'MontageSort', value: '2,1' }],
      total: 1, per_page: 200, current_page: 1, last_page: 1,
    })));
    const { result } = renderHook(() => useMontageReviewPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.enabled.map((m) => m.id)).toEqual([2, 1]));
  });

  it('the filter bar narrows which monitors the chip row offers', async () => {
    stubMonitors();
    const { result } = renderHook(() => useMontageReviewPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.allMonitors).toHaveLength(3));

    act(() => result.current.setFilteredMonitors(result.current.allMonitors.filter((m) => m.id === 2)));
    expect(result.current.enabled.map((m) => m.id)).toEqual([2]);
  });
});

describe('useMontageReviewPage — backend trouble', () => {
  it('reports isError with no monitors when /monitors 500s, and refetch retries', async () => {
    let hits = 0;
    server.use(
      http.get('/api/v3/monitors', () => {
        hits += 1;
        return HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'monitors table locked' }, { status: 500 });
      }),
    );
    const { result } = renderHook(() => useMontageReviewPage(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.allMonitors).toEqual([]);
    expect(result.current.selectedMonitors).toEqual([]);
    expect(result.current.error).toBeTruthy();

    act(() => result.current.refetch());
    await waitFor(() => expect(hits).toBeGreaterThan(1));
  });

  it('reports isError when the network is unreachable', async () => {
    server.use(http.get('/api/v3/monitors', () => HttpResponse.error()));
    const { result } = renderHook(() => useMontageReviewPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.allMonitors).toEqual([]);
  });

  it('does not query at all when signed out', () => {
    useAuthStore.setState({ isAuthenticated: false });
    try {
      // No MSW handler registered: a request here would fail the test.
      const { result } = renderHook(() => useMontageReviewPage(), { wrapper: makeWrapper() });
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.allMonitors).toEqual([]);
    } finally {
      useAuthStore.setState({ isAuthenticated: true });
    }
  });
});

describe('fitToEvents — legacy "Fit" button', () => {
  const page = (items: unknown[]) => ({
    items, total: items.length, per_page: 1, current_page: 1, last_page: 1,
  });
  const event = (id: number, start: string, end: string) => ({
    id, monitor_id: 1, start_date_time: start, end_date_time: end,
  });

  it('narrows the window onto the events the API reports', async () => {
    stubMonitors();
    const asked: string[] = [];
    server.use(
      http.get('/api/v3/events', ({ request }) => {
        const url = new URL(request.url);
        const dir = url.searchParams.get('direction') ?? '';
        asked.push(`${url.searchParams.get('monitor_id')}:${dir}`);
        return HttpResponse.json(page([
          dir === 'asc'
            ? event(1, '2026-08-21T10:00:00Z', '2026-08-21T10:10:00Z')
            : event(2, '2026-08-21T12:00:00Z', '2026-08-21T12:30:00Z'),
        ]));
      }),
    );

    const { result } = renderHook(() => useMontageReviewPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.selectedMonitors.length).toBeGreaterThan(0));

    act(() => result.current.fitToEvents());
    await waitFor(() => expect(result.current.isFittingEvents).toBe(false));

    // First and last event asked for, per selected monitor.
    expect(asked.some((a) => a.endsWith(':asc'))).toBe(true);
    expect(asked.some((a) => a.endsWith(':desc'))).toBe(true);
    expect(result.current.fitEventsEmpty).toBe(false);
    expect(result.current.preset).toBe('custom');
    expect(result.current.clock.rangeStart.getTime())
      .toBeLessThanOrEqual(Date.parse('2026-08-21T10:00:00Z'));
    expect(result.current.clock.rangeEnd.getTime())
      .toBeGreaterThanOrEqual(Date.parse('2026-08-21T12:30:00Z'));
    // Far tighter than the 24 h default it started from.
    expect(result.current.clock.rangeEnd.getTime() - result.current.clock.rangeStart.getTime())
      .toBeLessThan(4 * 60 * 60 * 1000);
  });

  it('leaves the range alone and says so when there are no events', async () => {
    stubMonitors();
    server.use(http.get('/api/v3/events', () => HttpResponse.json(page([]))));
    const { result } = renderHook(() => useMontageReviewPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.selectedMonitors.length).toBeGreaterThan(0));
    const before = result.current.clock.rangeStart.getTime();

    act(() => result.current.fitToEvents());
    await waitFor(() => expect(result.current.fitEventsEmpty).toBe(true));
    expect(result.current.clock.rangeStart.getTime()).toBe(before);
  });
});

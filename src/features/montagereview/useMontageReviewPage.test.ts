import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import {
  presetToRange,
  reviewGridColumns,
  useMontageReviewPage,
} from './useMontageReviewPage';

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', user: null, isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
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
  it('defaults to the last 24 hours, paused', () => {
    stubMonitors();
    const { result } = renderHook(() => useMontageReviewPage(), { wrapper: makeWrapper() });
    expect(result.current.preset).toBe('24h');
    expect(result.current.isLive).toBe(false);
    expect(result.current.clock.isPlaying).toBe(false);
    expect(result.current.clock.rangeEnd.getTime() - result.current.clock.rangeStart.getTime())
      .toBe(24 * 60 * 60 * 1000);
  });

  it('selects every capturing monitor once the filter bar reports, and toggles chips', async () => {
    stubMonitors();
    const { result } = renderHook(() => useMontageReviewPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.allMonitors).toHaveLength(3));
    expect(result.current.enabled).toEqual([]);

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

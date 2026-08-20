import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import type { Monitor } from '@/types';
import { useAuthStore } from '@/stores/auth';
import { useCyclePage, useCycleRotation } from './useCyclePage';

let mockSearch: Record<string, unknown> = {};
vi.mock('@tanstack/react-router', () => ({ useSearch: () => mockSearch, useNavigate: () => vi.fn() }));

const m = (id: number, over: Partial<Monitor> = {}): Monitor =>
  ({ id, name: `Cam ${id}`, capturing: 'Always', width: 1920, height: 1080, orientation: 'Rotate0', ...over }) as unknown as Monitor;

describe('useCycleRotation', () => {
  it('wraps in both directions and resets the countdown on a move', () => {
    const list = [m(1), m(2), m(3)];
    const { result } = renderHook(() => useCycleRotation(list));
    expect(result.current.current?.id).toBe(1);
    act(() => result.current.prev());
    expect(result.current.current?.id).toBe(3);
    act(() => result.current.next());
    act(() => result.current.next());
    expect(result.current.current?.id).toBe(2);
    act(() => result.current.setInterval(5));
    expect(result.current.countdown).toBe(5);
  });

  it('starts on the requested monitor once it appears, then yields to the operator', () => {
    const { result, rerender } = renderHook(
      ({ list }: { list: Monitor[] }) => useCycleRotation(list, { startMonitorId: 3 }),
      { initialProps: { list: [] as Monitor[] } },
    );
    expect(result.current.current).toBeUndefined();
    rerender({ list: [m(1), m(2), m(3)] });
    expect(result.current.current?.id).toBe(3);
    expect(result.current.index).toBe(2);
    act(() => result.current.next());
    expect(result.current.current?.id).toBe(1);
  });

  it('auto-advances from the resolved start position, not from zero', () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useCycleRotation([m(1), m(2), m(3)], { startMonitorId: 2 }));
      act(() => result.current.setInterval(5));
      act(() => { vi.advanceTimersByTime(5_000); });
      expect(result.current.current?.id).toBe(3);
      act(() => result.current.togglePause());
      act(() => { vi.advanceTimersByTime(10_000); });
      expect(result.current.current?.id).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('clamps when the list shrinks under it', () => {
    const { result, rerender } = renderHook(({ list }: { list: Monitor[] }) => useCycleRotation(list), {
      initialProps: { list: [m(1), m(2), m(3)] },
    });
    act(() => result.current.jumpTo(2));
    rerender({ list: [m(1), m(2)] });
    expect(result.current.index).toBe(0);
  });
});

const server = setupServer(
  http.get('/api/v3/monitors', () =>
    HttpResponse.json({ items: [m(1), m(2, { capturing: 'None' }), m(3)], total: 3, per_page: 100, current_page: 1, last_page: 1 })),
);
beforeAll(() => {
  useAuthStore.setState({ accessToken: 't', refreshToken: 't', user: null, isAuthenticated: true });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => { server.resetHandlers(); mockSearch = {}; });
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
}

describe('useCyclePage', () => {
  it('rotates over capturing monitors, honours ?monitor_id, and a caller-supplied source', async () => {
    mockSearch = { monitor_id: 3 };
    const { result } = renderHook(() => useCyclePage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.monitors).toHaveLength(2));
    expect(result.current.monitors.map((x) => x.id)).toEqual([1, 3]);
    expect(result.current.current?.id).toBe(3);
    expect(result.current.allMonitors).toHaveLength(3);
  });

  it('narrows the rotation to the filter-bar survivors and exposes the stage controls', async () => {
    const { result } = renderHook(() => useCyclePage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.monitors).toHaveLength(2));
    act(() => result.current.setFilteredMonitors([m(3)]));
    expect(result.current.monitors.map((x) => x.id)).toEqual([3]);
    act(() => result.current.setViewMode('stills'));
    expect(result.current.viewMode).toBe('stills');
    act(() => result.current.stage.setScale('640px'));
    expect(result.current.stage.style).toMatchObject({ maxWidth: '640px' });
  });

  it('accepts an explicit rotation source (classic filter row)', async () => {
    const { result } = renderHook(() => useCyclePage({ monitors: [m(1)] }), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.allMonitors).toHaveLength(3));
    expect(result.current.monitors.map((x) => x.id)).toEqual([1]);
  });
});

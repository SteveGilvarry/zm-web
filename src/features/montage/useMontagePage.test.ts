import { describe, expect, it, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import { useMontageStore } from '@/stores/montage';
import { leaf, leafCount, leafMonitors } from './mosaic';
import { MONTAGE_PRESETS, useMontagePage, useMontageWallPage } from './useMontagePage';

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', user: null, isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  useMontageStore.setState({ tree: leaf(null), protocol: 'webrtc' });
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
  { id: 1, name: 'Front', capturing: 'Always', orientation: 'ROTATE_0' },
  { id: 2, name: 'Back', capturing: 'Always', orientation: 'ROTATE_0' },
  { id: 3, name: 'Off', capturing: 'None', orientation: 'ROTATE_0' },
];

function stubMonitors() {
  server.use(
    http.get('/api/v3/monitors', () =>
      HttpResponse.json({ items: monitors, total: 3, per_page: 50, current_page: 1, last_page: 1 }),
    ),
  );
}

describe('useMontagePage (mosaic)', () => {
  it('seeds an empty persisted tree with the first capturing monitor', async () => {
    stubMonitors();
    const { result } = renderHook(() => useMontagePage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.monitors).toHaveLength(3));
    expect(result.current.enabledMonitors.map((m) => m.id)).toEqual([1, 2]);
    await waitFor(() => expect(leafMonitors(result.current.tree)).toEqual([1]));
    expect(result.current.cellsOnScreen).toBe(1);
  });

  it('applies a preset, reusing on-screen monitors then padding with unused ones', async () => {
    stubMonitors();
    const { result } = renderHook(() => useMontagePage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(leafMonitors(result.current.tree)).toEqual([1]));

    const twoByTwo = MONTAGE_PRESETS.find((p) => p.id === '2x2')!;
    act(() => result.current.applyPreset(twoByTwo));
    expect(leafCount(result.current.tree)).toBe(4);
    expect(leafMonitors(result.current.tree)).toEqual([1, 2, null, null]);
  });

  it('bumps the stream generation on restart and on a real protocol change only', async () => {
    stubMonitors();
    const { result } = renderHook(() => useMontagePage(), { wrapper: makeWrapper() });
    expect(result.current.streamGeneration).toBe(0);
    act(() => result.current.restartAll());
    expect(result.current.streamGeneration).toBe(1);
    act(() => result.current.changeProtocol('webrtc'));
    expect(result.current.streamGeneration).toBe(1);
    act(() => result.current.changeProtocol('hls'));
    expect(result.current.protocol).toBe('hls');
    expect(result.current.streamGeneration).toBe(2);
  });

  it('tracks the cell being picked for and assigns the chosen monitor', async () => {
    stubMonitors();
    const { result } = renderHook(() => useMontagePage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(leafMonitors(result.current.tree)).toEqual([1]));
    expect(result.current.picking).toBeNull();
    act(() => result.current.chooseMonitor([]));
    expect(result.current.picking).toEqual([]);
    act(() => result.current.pickMonitor(2));
    expect(result.current.picking).toBeNull();
    expect(leafMonitors(result.current.tree)).toEqual([2]);
  });
});

describe('useMontageWallPage (flat wall)', () => {
  it('shows only capturing monitors that also pass the filter bar', async () => {
    stubMonitors();
    const { result } = renderHook(() => useMontageWallPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.monitors).toHaveLength(3));
    // Nothing visible until the filter bar reports its (initially full) selection.
    expect(result.current.visibleMonitors).toEqual([]);
    act(() => result.current.setFilteredMonitors(result.current.monitors));
    expect(result.current.visibleMonitors.map((m) => m.id)).toEqual([1, 2]);
    act(() => result.current.setFilteredMonitors([result.current.monitors[1], result.current.monitors[2]]));
    expect(result.current.visibleMonitors.map((m) => m.id)).toEqual([2]);
  });
});

import { describe, expect, it, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import { useMontageStore } from '@/stores/montage';
import { leaf, leafCount, leafMonitors, split } from './mosaic';
import { MONTAGE_PRESETS, autoLayout, useMontagePage, useMontageWallPage } from './useMontagePage';

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
beforeEach(() => {
  useMontageStore.setState({ tree: leaf(null), protocol: 'webrtc', statusPosition: 'inside' });
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
  it('seeds a fresh install with the Auto layout sized to the fleet', async () => {
    stubMonitors();
    const { result } = renderHook(() => useMontagePage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.monitors).toHaveLength(3));
    expect(result.current.enabledMonitors.map((m) => m.id)).toEqual([1, 2]);
    // autoColumns(2) === 2 → one row of two.
    await waitFor(() => expect(leafMonitors(result.current.tree)).toEqual([1, 2]));
    expect(result.current.cellsOnScreen).toBe(2);
  });

  it('fills, but does not reshape, a vacant tree the operator already arranged', async () => {
    stubMonitors();
    useMontageStore.setState({ tree: split('column', [leaf(null), leaf(null), leaf(null)]) });
    const { result } = renderHook(() => useMontagePage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(leafMonitors(result.current.tree)).toEqual([1, 2, null]));
    expect(result.current.tree.type).toBe('split');
  });

  it('exposes the persisted status position and the live-tile cap', async () => {
    stubMonitors();
    const { result } = renderHook(() => useMontagePage(), { wrapper: makeWrapper() });
    expect(result.current.statusPosition).toBe('inside');
    act(() => result.current.setStatusPosition('outside'));
    expect(result.current.statusPosition).toBe('outside');
    expect(useMontageStore.getState().statusPosition).toBe('outside');
    act(() => result.current.setMaxLiveTiles(24));
    expect(result.current.maxLiveTiles).toBe(24);
  });

  it('autoLayout follows the montage.php column heuristic', () => {
    expect(leafMonitors(autoLayout([1, 2, 3, 4]))).toEqual([1, 2, 3, 4]);
    const four = autoLayout([1, 2, 3, 4]);
    expect(four.type === 'split' && four.children).toHaveLength(2); // 2 wide → 2 rows
    expect(leafMonitors(autoLayout([1, 2, 3, 4, 5]))).toEqual([1, 2, 3, 4, 5, null]); // 3 wide → 2 rows
    expect(autoLayout([])).toEqual(leaf(null));
  });

  it('applies a preset, reusing on-screen monitors then padding with unused ones', async () => {
    stubMonitors();
    const { result } = renderHook(() => useMontagePage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(leafMonitors(result.current.tree)).toEqual([1, 2]));

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
    await waitFor(() => expect(leafMonitors(result.current.tree)).toEqual([1, 2]));
    expect(result.current.picking).toBeNull();
    act(() => result.current.chooseMonitor([0]));
    expect(result.current.picking).toEqual([0]);
    act(() => result.current.pickMonitor(2));
    expect(result.current.picking).toBeNull();
    expect(leafMonitors(result.current.tree)).toEqual([2, 2]);
  });
});

describe('useMontageWallPage (flat wall)', () => {
  it('shows only capturing monitors that also pass the filter bar', async () => {
    stubMonitors();
    const { result } = renderHook(() => useMontageWallPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.monitors).toHaveLength(3));
    // Every capturing monitor shows until the filter bar reports.
    expect(result.current.visibleMonitors.map((m) => m.id)).toEqual([1, 2]);
    act(() => result.current.setFilteredMonitors(result.current.monitors));
    expect(result.current.visibleMonitors.map((m) => m.id)).toEqual([1, 2]);
    act(() => result.current.setFilteredMonitors([result.current.monitors[1], result.current.monitors[2]]));
    expect(result.current.visibleMonitors.map((m) => m.id)).toEqual([2]);
  });
});

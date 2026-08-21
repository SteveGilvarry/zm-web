/**
 * useMontagePage — the parts the first suite skipped: the translated preset
 * list, `?group=` seeding the shared filter store, the split/close/pick
 * layout verbs, fullscreen, and the wall page's error + refetch paths.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import { useMonitorFilterStore } from '@/stores/monitorFilter';
import { useMontageStore } from '@/stores/montage';
import { leaf, leafCount, leafMonitors, nodeAt, split } from './mosaic';
import {
  MONTAGE_PRESETS, useMontagePage, useMontagePresets, useMontageWallPage,
} from './useMontagePage';

let mockSearch: Record<string, unknown> = {};
vi.mock('@tanstack/react-router', () => ({
  useSearch: () => mockSearch,
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
  useMonitorFilterStore.getState().reset();
});
afterEach(() => { server.resetHandlers(); mockSearch = {}; });
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } } });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

const monitors = [
  { id: 1, name: 'Front', capturing: 'Always', orientation: 'ROTATE_0' },
  { id: 2, name: 'Back', capturing: 'Always', orientation: 'ROTATE_0' },
  { id: 3, name: 'Off', capturing: 'None', orientation: 'ROTATE_0' },
];

function stubMonitors(items: unknown[] = monitors) {
  server.use(http.get('/api/v3/monitors', () =>
    HttpResponse.json({ items, total: items.length, per_page: 50, current_page: 1, last_page: 1 })));
}

/* ======================================================================== */

describe('montage presets', () => {
  it('every preset builds a tree with the number of cells its label promises', () => {
    const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
    const built = Object.fromEntries(
      MONTAGE_PRESETS.map((p) => [p.id, p.build(ids.slice(0, p.size))]),
    );
    expect(leafCount(built['1x1'])).toBe(1);
    expect(leafCount(built['2x2'])).toBe(4);
    expect(leafCount(built['3x3'])).toBe(9);
    expect(leafCount(built['4x4'])).toBe(16);
    expect(leafCount(built.banner)).toBe(4);
    expect(leafCount(built.pip)).toBe(4);
    expect(leafMonitors(built['2x2'])).toEqual([1, 2, 3, 4]);
  });

  it('useMontagePresets returns the same ids with translated labels', () => {
    const { result } = renderHook(() => useMontagePresets());
    expect(result.current.map((p) => p.id)).toEqual(MONTAGE_PRESETS.map((p) => p.id));
    expect(result.current.map((p) => p.label)).toEqual(['1×1', '2×2', '3×3', '4×4', 'Banner', 'PIP']);
    // The builders are live, not just labels.
    expect(leafCount(result.current[1].build([1, 2, 3, 4]))).toBe(4);
    expect(leafCount(result.current[2].build([1]))).toBe(9);
    expect(leafCount(result.current[3].build([1]))).toBe(16);
    expect(leafCount(result.current[0].build([1]))).toBe(1);
  });
});

describe('useMontagePage — ?group=', () => {
  it('applies the URL group to the shared filter store once', async () => {
    mockSearch = { group: '4' };
    stubMonitors();
    const { rerender } = renderHook(() => useMontagePage(), { wrapper: wrapper() });
    await waitFor(() => expect(useMonitorFilterStore.getState().groupIds).toEqual([4]));

    // Operator clears the chip; a re-render must not re-apply the URL value.
    act(() => useMonitorFilterStore.getState().setGroupIds([]));
    rerender();
    expect(useMonitorFilterStore.getState().groupIds).toEqual([]);
  });

  it('leaves the filter store alone when there is no group in the URL', async () => {
    stubMonitors();
    renderHook(() => useMontagePage(), { wrapper: wrapper() });
    await waitFor(() => expect(useMonitorFilterStore.getState().groupIds).toEqual([]));
  });
});

describe('useMontagePage — layout verbs', () => {
  it('splitting a cell fills the new half with a monitor that is not already up', async () => {
    stubMonitors();
    useMontageStore.setState({ tree: leaf(1) });
    const { result } = renderHook(() => useMontagePage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.enabledMonitors).toHaveLength(2));

    act(() => result.current.split([], 'row'));
    await waitFor(() => expect(leafMonitors(result.current.tree)).toEqual([1, 2]));
    expect(nodeAt(result.current.tree, [])).toMatchObject({ type: 'split', direction: 'row' });
  });

  it('splitting with every monitor already on screen leaves the new cell vacant', async () => {
    stubMonitors();
    useMontageStore.setState({ tree: split('row', [leaf(1), leaf(2)]) });
    const { result } = renderHook(() => useMontagePage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.enabledMonitors).toHaveLength(2));

    act(() => result.current.split([0], 'column'));
    await waitFor(() => expect(leafMonitors(result.current.tree)).toEqual([1, null, 2]));
  });

  it('closing a cell removes it and collapses the split', async () => {
    stubMonitors();
    useMontageStore.setState({ tree: split('row', [leaf(1), leaf(2)]) });
    const { result } = renderHook(() => useMontagePage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.cellsOnScreen).toBe(2));

    act(() => result.current.close([1]));
    await waitFor(() => expect(result.current.cellsOnScreen).toBe(1));
    expect(leafMonitors(result.current.tree)).toEqual([1]);
  });

  it('the monitor picker only writes to the cell that opened it', async () => {
    stubMonitors();
    useMontageStore.setState({ tree: split('row', [leaf(1), leaf(null)]) });
    const { result } = renderHook(() => useMontagePage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.enabledMonitors).toHaveLength(2));

    // No cell picked yet — the call is a no-op.
    act(() => result.current.pickMonitor(2));
    expect(leafMonitors(result.current.tree)).toEqual([1, null]);

    act(() => result.current.chooseMonitor([1]));
    expect(result.current.picking).toEqual([1]);
    act(() => result.current.pickMonitor(2));
    await waitFor(() => expect(leafMonitors(result.current.tree)).toEqual([1, 2]));
    expect(result.current.picking).toBeNull();
  });

  it('cancelling the picker clears it without touching the tree', async () => {
    stubMonitors();
    useMontageStore.setState({ tree: split('row', [leaf(1), leaf(null)]) });
    const { result } = renderHook(() => useMontagePage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.enabledMonitors).toHaveLength(2));

    act(() => result.current.chooseMonitor([1]));
    act(() => result.current.cancelPick());
    expect(result.current.picking).toBeNull();
    expect(leafMonitors(result.current.tree)).toEqual([1, null]);
  });

  it('narrows filteredIds to what the filter bar reports', async () => {
    stubMonitors();
    const { result } = renderHook(() => useMontagePage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.monitors).toHaveLength(3));

    act(() => result.current.setFilteredMonitors([result.current.monitors[1]]));
    expect([...result.current.filteredIds]).toEqual([2]);
  });
});

describe('useMontagePage — fullscreen', () => {
  it('requests fullscreen on the grid, and exits when already fullscreen', async () => {
    stubMonitors();
    const { result } = renderHook(() => useMontagePage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.monitors).toHaveLength(3));

    // No viewport attached yet: nothing happens.
    act(() => result.current.toggleFullscreen());

    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    const el = document.createElement('div');
    Object.assign(el, { requestFullscreen });
    result.current.gridRef.current = el;

    act(() => result.current.toggleFullscreen());
    expect(requestFullscreen).toHaveBeenCalledTimes(1);

    const exitFullscreen = vi.fn();
    Object.defineProperty(document, 'fullscreenElement', { value: el, configurable: true });
    Object.defineProperty(document, 'exitFullscreen', { value: exitFullscreen, configurable: true });
    act(() => result.current.toggleFullscreen());
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
  });

  it('swallows a rejected fullscreen request', async () => {
    stubMonitors();
    const { result } = renderHook(() => useMontagePage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.monitors).toHaveLength(3));

    const el = document.createElement('div');
    Object.assign(el, { requestFullscreen: () => Promise.reject(new Error('denied')) });
    result.current.gridRef.current = el;
    expect(() => act(() => result.current.toggleFullscreen())).not.toThrow();
  });
});

describe('useMontageWallPage — error paths', () => {
  it('surfaces a 500 and can be retried', async () => {
    let hits = 0;
    server.use(http.get('/api/v3/monitors', () => {
      hits++;
      return HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'Monitors is locked' }, { status: 500 });
    }));
    const { result } = renderHook(() => useMontageWallPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeTruthy();
    expect(result.current.visibleMonitors).toEqual([]);

    const before = hits;
    act(() => result.current.refetch());
    await waitFor(() => expect(hits).toBeGreaterThan(before));
  });

  it('reports the backend being unreachable', async () => {
    server.use(http.get('/api/v3/monitors', () => HttpResponse.error()));
    const { result } = renderHook(() => useMontageWallPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.monitors).toEqual([]);
  });

  it('an empty fleet is not an error', async () => {
    stubMonitors([]);
    const { result } = renderHook(() => useMontageWallPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isError).toBe(false);
    expect(result.current.capturingMonitors).toEqual([]);
    expect(result.current.visibleMonitors).toEqual([]);
  });
});

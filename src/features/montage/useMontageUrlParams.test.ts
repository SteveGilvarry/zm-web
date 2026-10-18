/**
 * The request params montage.php honours (`zmMontageLayout`, `showZones`,
 * `monitorStatusPositionSelected`, `header`), as both skins read them.
 */
import { describe, expect, it, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import { useMontageStore } from '@/stores/montage';
import { gridLayout, leaf, leafMonitors } from './mosaic';
import { serialisePositions } from './layoutFormat';
import { parseStatusPosition, useMontageUrlParams } from './useMontageUrlParams';
import { treeForLayoutRow, useMontagePage } from './useMontagePage';
import { layoutValueForRow } from './useClassicMontage';

let mockSearch: Record<string, unknown> = {};
vi.mock('@tanstack/react-router', () => ({
  useSearch: () => mockSearch,
  useNavigate: () => vi.fn(),
}));

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({ accessToken: 't', refreshToken: 't', user: null, isAuthenticated: true });
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  useMontageStore.setState({ tree: leaf(null), statusPosition: 'inside', showZones: false });
});
afterEach(() => { server.resetHandlers(); mockSearch = {}; });
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
}

const SAVED = serialisePositions(gridLayout(1, 2, [2, 1]), 'outside');
const ROWS = [
  { id: 1, name: 'Freeform', positions: '{ "default":{"float":"left"} }' },
  { id: 4, name: '3 Wide', positions: '{ "default":{"float":"left", "width":"33.3%"} }' },
  { id: 9, name: 'Porch', positions: SAVED },
  { id: 10, name: 'Old one', positions: '{ "mId1":{"width":"50%"} }' },
];

describe('parseStatusPosition', () => {
  it('reads legacy values and the store\'s own', () => {
    expect(parseStatusPosition('insideImgBottom')).toBe('inside');
    expect(parseStatusPosition('outsideImgBottom')).toBe('outside');
    expect(parseStatusPosition('showOnHover')).toBe('hover');
    expect(parseStatusPosition('hidden')).toBe('hidden');
    expect(parseStatusPosition('hover')).toBe('hover');
    expect(parseStatusPosition('sideways')).toBeUndefined();
    expect(parseStatusPosition(undefined)).toBeUndefined();
  });
});

describe('layoutValueForRow (classic select)', () => {
  const listed = new Set([9]);
  it('maps preset rows to the built-in preset, Freeform to Auto', () => {
    expect(layoutValueForRow(ROWS, listed, 1)).toBe('preset:auto');
    expect(layoutValueForRow(ROWS, listed, 4)).toBe('preset:3w');
  });
  it('maps a listed saved row to itself and anything else to nothing', () => {
    expect(layoutValueForRow(ROWS, listed, 9)).toBe('saved:9');
    expect(layoutValueForRow(ROWS, listed, 10)).toBeNull();
    expect(layoutValueForRow(ROWS, listed, 404)).toBeNull();
  });
});

describe('treeForLayoutRow (modern mosaic)', () => {
  it('uses a row\'s own tree, else the grid its preset name describes', () => {
    expect(leafMonitors(treeForLayoutRow(ROWS, 9, [1, 2, 3])!)).toEqual([2, 1]);
    expect(leafMonitors(treeForLayoutRow(ROWS, 4, [1, 2, 3, 4])!)).toEqual([1, 2, 3, 4, null, null]);
    expect(leafMonitors(treeForLayoutRow(ROWS, 1, [1, 2])!)).toEqual([1, 2]);
    expect(treeForLayoutRow(ROWS, 10, [1])).toBeNull();
    expect(treeForLayoutRow(ROWS, 404, [1])).toBeNull();
  });
});

describe('useMontageUrlParams', () => {
  it('writes showZones and the status position into the store, once', async () => {
    mockSearch = { show_zones: '1', status_position: 'showOnHover' };
    const { result, rerender } = renderHook(() => useMontageUrlParams());
    await waitFor(() => expect(useMontageStore.getState().showZones).toBe(true));
    expect(useMontageStore.getState().statusPosition).toBe('hover');
    expect(result.current.headerHidden).toBe(false);

    // The operator changes it afterwards; a re-render does not undo that.
    useMontageStore.getState().setShowZones(false);
    rerender();
    expect(useMontageStore.getState().showZones).toBe(false);
  });

  it('reports header=0 and header=hidden as kiosk', () => {
    mockSearch = { header: '0', layout: 7 };
    const { result, rerender } = renderHook(() => useMontageUrlParams());
    expect(result.current).toEqual({ layoutId: 7, headerHidden: true });
    mockSearch = { header: 'hidden' };
    rerender();
    expect(result.current.headerHidden).toBe(true);
  });
});

describe('useMontagePage ?layout=', () => {
  it('loads the named row into the mosaic and passes header=0 through', async () => {
    mockSearch = { layout: 9, header: '0' };
    server.use(
      http.get('/api/v3/monitors', () => HttpResponse.json({
        items: [1, 2, 3].map((id) => ({ id, name: `Cam ${id}`, capturing: 'Always', orientation: 'ROTATE_0' })),
        total: 3, per_page: 100, current_page: 1, last_page: 1,
      })),
      http.get('/api/v3/montage_layouts', () => HttpResponse.json({
        items: ROWS.map((r) => ({ ...r, user_id: 1 })), total: ROWS.length, per_page: 200, current_page: 1, last_page: 1,
      })),
    );
    const { result } = renderHook(() => useMontagePage(), { wrapper: wrapper() });
    await waitFor(() => expect(leafMonitors(result.current.tree)).toEqual([2, 1]));
    expect(result.current.headerHidden).toBe(true);
  });
});

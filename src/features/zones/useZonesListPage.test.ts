/**
 * `useZonesListPage` — legacy `?view=zones&mid=`: the zone table for one
 * monitor plus the "Mark" checkboxes and their bulk delete.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/components/common/toastStore';
import { makeZone } from '@/test/fixtures';
import { useZonesListPage } from './useZonesListPage';

const paged = (items: unknown[]) =>
  HttpResponse.json({ items, total: items.length, per_page: 100, current_page: 1, last_page: 1 });

let deleted: number[] = [];

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({ accessToken: 't', refreshToken: 't', user: null, isAuthenticated: true });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  server.resetHandlers();
  deleted = [];
  useToastStore.getState().clear();
});
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

function wrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

const zone = (id: number, name: string, over: Record<string, unknown> = {}) =>
  makeZone({
    id, monitor_id: 4, name, type: 'Active', units: 'Pixels',
    coords: '0,0 100,0 100,100 0,100', num_coords: 4, area: 10_000, ...over,
  });

function stubMonitor(over: Record<string, unknown> = {}) {
  server.use(
    http.get('/api/v3/monitors/4', () => HttpResponse.json({
      id: 4, name: 'Stairs', width: 1280, height: 720, orientation: 'ROTATE_90',
      type: 'Ffmpeg', capturing: 'Always', analysing: 'Always', recording: 'OnMotion', ...over,
    })),
  );
}

function stubZones(items: unknown[] = [zone(1, 'All'), zone(2, 'Doorway'), zone(3, 'Hedge')]) {
  server.use(http.get('/api/v3/monitors/4/zones', () => paged(items)));
}

function stubDelete() {
  server.use(
    http.delete('/api/v3/zones/:id', ({ params }) => {
      deleted.push(Number(params.id));
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

async function mount(monitorId = 4) {
  const hook = renderHook(() => useZonesListPage(monitorId), { wrapper: wrapper() });
  await waitFor(() => expect(hook.result.current.zonesLoading).toBe(false));
  return hook;
}

describe('useZonesListPage — data', () => {
  it('exposes the zone list alongside the base monitor/view state', async () => {
    stubMonitor();
    stubZones();
    const { result } = await mount();

    await waitFor(() => expect(result.current.monitor?.name).toBe('Stairs'));
    expect(result.current.zones.map((z) => z.name)).toEqual(['All', 'Doorway', 'Hedge']);
    expect(result.current.monitorId).toBe(4);
    // ROTATE_90 swaps the editor frame — inherited from useZonesPage.
    expect(result.current.view).toEqual({ width: 720, height: 1280 });
    expect(result.current.hasDimensions).toBe(true);
    expect(result.current.zonesError).toBe(false);
    expect(result.current.busy).toBe(false);
  });

  it('returns an empty list when the monitor has no zones', async () => {
    stubMonitor();
    stubZones([]);
    const { result } = await mount();

    expect(result.current.zones).toEqual([]);
    expect(result.current.marked.size).toBe(0);
  });

  it('flags zonesError and keeps the list empty when the zone query 500s', async () => {
    stubMonitor();
    server.use(
      http.get('/api/v3/monitors/4/zones', () =>
        HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'Zones table locked' }, { status: 500 })),
    );
    const { result } = await mount();

    await waitFor(() => expect(result.current.zonesError).toBe(true));
    expect(result.current.zones).toEqual([]);
    expect(String((result.current.error as Error).message)).toMatch(/Zones table locked/);
  });

  it('flags zonesError on a network failure too', async () => {
    stubMonitor();
    server.use(http.get('/api/v3/monitors/4/zones', () => HttpResponse.error()));
    const { result } = await mount();

    await waitFor(() => expect(result.current.zonesError).toBe(true));
    expect(result.current.zones).toEqual([]);
  });

  it('skips both queries when there is no monitor id', async () => {
    const { result } = renderHook(() => useZonesListPage(0), { wrapper: wrapper() });
    // Disabled queries never leave `pending` → isLoading stays true; nothing is fetched.
    expect(result.current.zones).toEqual([]);
    expect(result.current.monitor).toBeUndefined();
    expect(result.current.hasDimensions).toBe(false);
  });

  it('refetch pulls the list again', async () => {
    stubMonitor();
    let hits = 0;
    server.use(http.get('/api/v3/monitors/4/zones', () => {
      hits += 1;
      return paged([zone(1, 'All')]);
    }));
    const { result } = await mount();
    await waitFor(() => expect(hits).toBe(1));

    act(() => result.current.refetch());
    await waitFor(() => expect(hits).toBe(2));
  });
});

describe('useZonesListPage — marking', () => {
  it('toggles one mark on and off', async () => {
    stubMonitor();
    stubZones();
    const { result } = await mount();
    await waitFor(() => expect(result.current.zones).toHaveLength(3));

    act(() => result.current.toggleMark(2));
    expect([...result.current.marked]).toEqual([2]);

    act(() => result.current.toggleMark(2));
    expect(result.current.marked.size).toBe(0);
  });

  it('toggleMarkAll selects every zone, then clears when all are already marked', async () => {
    stubMonitor();
    stubZones();
    const { result } = await mount();
    await waitFor(() => expect(result.current.zones).toHaveLength(3));

    act(() => result.current.toggleMarkAll());
    expect([...result.current.marked].sort()).toEqual([1, 2, 3]);

    act(() => result.current.toggleMarkAll());
    expect(result.current.marked.size).toBe(0);
  });

  it('toggleMarkAll from a partial selection selects everything', async () => {
    stubMonitor();
    stubZones();
    const { result } = await mount();
    await waitFor(() => expect(result.current.zones).toHaveLength(3));

    act(() => result.current.toggleMark(1));
    act(() => result.current.toggleMarkAll());
    expect([...result.current.marked].sort()).toEqual([1, 2, 3]);
  });
});

describe('useZonesListPage — deleteMarked', () => {
  it('confirms, DELETEs each marked zone, clears the marks and toasts the count', async () => {
    stubMonitor();
    stubZones();
    stubDelete();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { result } = await mount();
    await waitFor(() => expect(result.current.zones).toHaveLength(3));

    act(() => { result.current.toggleMark(1); });
    act(() => { result.current.toggleMark(3); });
    act(() => result.current.deleteMarked());

    await waitFor(() => expect(deleted.sort()).toEqual([1, 3]));
    expect(confirm).toHaveBeenCalledWith('Delete 2 zones?');
    await waitFor(() => expect(result.current.marked.size).toBe(0));
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.message).toBe('2 zones deleted'));
    expect(useToastStore.getState().toasts[0].tone).toBe('success');
  });

  it('sends nothing when the operator cancels the confirm', async () => {
    stubMonitor();
    stubZones();
    stubDelete();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { result } = await mount();
    await waitFor(() => expect(result.current.zones).toHaveLength(3));

    act(() => { result.current.toggleMark(1); });
    act(() => result.current.deleteMarked());

    await waitFor(() => expect(result.current.marked.size).toBe(1));
    expect(deleted).toEqual([]);
  });

  it('does nothing at all when no zone is marked', async () => {
    stubMonitor();
    stubZones();
    stubDelete();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { result } = await mount();
    await waitFor(() => expect(result.current.zones).toHaveLength(3));

    act(() => result.current.deleteMarked());

    expect(confirm).not.toHaveBeenCalled();
    expect(deleted).toEqual([]);
  });

  it('surfaces the first failure as an error toast and keeps the marks', async () => {
    stubMonitor();
    stubZones();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    server.use(
      http.delete('/api/v3/zones/:id', ({ params }) => {
        if (params.id === '2') {
          return HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'zone 2 is in use' }, { status: 500 });
        }
        deleted.push(Number(params.id));
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { result } = await mount();
    await waitFor(() => expect(result.current.zones).toHaveLength(3));

    act(() => { result.current.toggleMark(1); });
    act(() => { result.current.toggleMark(2); });
    act(() => result.current.deleteMarked());

    await waitFor(() => expect(useToastStore.getState().toasts).toHaveLength(1));
    expect(useToastStore.getState().toasts[0].tone).toBe('error');
    expect(useToastStore.getState().toasts[0].message).toMatch(/zone 2 is in use/);
    // Zone 1 still went out — Promise.allSettled fires them all.
    expect(deleted).toEqual([1]);
    expect(result.current.marked.size).toBe(2);
  });
});

describe('useZonesListPage — editor target', () => {
  it('opens on a zone id, switches to the new-zone draft, and closes', async () => {
    stubMonitor();
    stubZones();
    const { result } = await mount();
    await waitFor(() => expect(result.current.zones).toHaveLength(3));

    expect(result.current.editing).toBeNull();

    act(() => result.current.openEditor(3));
    expect(result.current.editing).toBe(3);

    act(() => result.current.openEditor('new'));
    expect(result.current.editing).toBe('new');

    act(() => result.current.closeEditor());
    expect(result.current.editing).toBeNull();
  });
});

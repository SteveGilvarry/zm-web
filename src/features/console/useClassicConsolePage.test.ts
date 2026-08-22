import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import { useMonitorFilterStore } from '@/stores/monitorFilter';
import { useToastStore } from '@/components/common/toastStore';
import { useConsoleColumnsStore } from './consoleColumns';

let mockSearch: Record<string, unknown> = {};
const navigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({ useSearch: () => mockSearch, useNavigate: () => navigate }));

// useConsoleData fires eight queries; stub it and test what this hook adds.
const { fakeData } = vi.hoisted(() => {
  const mk = (id: number, over: Record<string, unknown> = {}) => ({
    id, name: `Cam ${id}`, capturing: 'Always', analysing: 'Always', recording: 'OnMotion',
    host: `10.0.0.${id}`, type: 'Ffmpeg', width: 1920, height: 1080, zone_count: 1, sequence: id,
    onvif_event_listener: 0, storage_id: 1, ...over,
  });
  return {
    fakeData: {
      monitors: [mk(1, { sequence: 3 }), mk(2, { sequence: 1, capturing: 'None' }), mk(3, { sequence: 2 })],
      liveSessions: [],
      events: [],
      eventCount24h: 0,
      daemons: [],
      isSystemRunning: true,
      systemStats: undefined,
      summariesByMonitor: [
        { monitor_id: 1, total_events: 30, total_event_disk_space: 100, hour_events: 6, hour_event_disk_space: 1, day_events: 0, day_event_disk_space: 0, week_events: 0, week_event_disk_space: 0, month_events: 0, month_event_disk_space: 0, archived_events: 0, archived_event_disk_space: 0 },
      ],
      hourlyByMonitor: {},
      runtimeById: {
        1: { monitorId: 1, status: 'Connected', captureFps: 10, analysisFps: 5, bandwidth: 2048, updatedOn: '' },
        3: { monitorId: 3, status: 'NotRunning', captureFps: 0, analysisFps: 0, bandwidth: 0, updatedOn: '' },
      },
      loading: { monitors: false, events: false },
      isError: false,
      error: null,
      refetch: () => {},
    },
  };
});
vi.mock('./useConsoleData', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./useConsoleData')>()),
  useConsoleData: () => fakeData,
}));

const { useClassicConsolePage } = await import('./useClassicConsolePage');

const paged = (items: unknown[]) => HttpResponse.json({ items, total: items.length, per_page: 100, current_page: 1, last_page: 1 });
const patched: Array<{ id: string; body: unknown }> = [];
const deleted: string[] = [];
const server = setupServer(
  http.get('/api/v3/groups', () => paged([])),
  http.get('/api/v3/groups-monitors', () => paged([])),
  http.get('/api/v3/servers', () => paged([{ id: 1, name: 'zm-a' }])),
  http.get('/api/v3/storage', () => paged([{ id: 1, name: 'Default' }])),
  http.get('/api/v3/configs/:name', ({ params }) =>
    HttpResponse.json({ name: params.name, value: params.name === 'ZM_WEB_EVENTS_PER_PAGE' ? '2' : '1' })),
  http.patch('/api/v3/monitors/:id', async ({ params, request }) => {
    patched.push({ id: String(params.id), body: await request.json() });
    return HttpResponse.json({ id: Number(params.id) });
  }),
  http.delete('/api/v3/monitors/:id', ({ params }) => { deleted.push(String(params.id)); return new HttpResponse(null, { status: 204 }); }),
);
beforeAll(() => {
  useAuthStore.setState({ accessToken: 't', refreshToken: 't', user: null, isAuthenticated: true });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  server.resetHandlers();
  patched.length = 0; deleted.length = 0; navigate.mockClear();
  mockSearch = {};
  useMonitorFilterStore.getState().reset();
  useConsoleColumnsStore.getState().reset();
  useToastStore.getState().clear();
});
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
}

describe('useClassicConsolePage', () => {
  it('sorts by sequence, pages per ZM_WEB_EVENTS_PER_PAGE, and totals the visible rows', async () => {
    const { result } = renderHook(() => useClassicConsolePage(), { wrapper: wrapper() });
    expect(result.current.allRows.map((r) => r.monitor.id)).toEqual([2, 3, 1]);
    await waitFor(() => expect(result.current.pageSize).toBe(2));
    expect(result.current.rows.map((r) => r.monitor.id)).toEqual([2, 3]);
    act(() => result.current.setPage(2));
    expect(result.current.rows.map((r) => r.monitor.id)).toEqual([1]);
    expect(result.current.totals.events.count).toBe(30);
    expect(result.current.totals.zones).toBe(3);
    expect(result.current.runtimeTotals.byTone).toEqual({ ok: 1, warn: 0, down: 1, unknown: 1 });
    expect(result.current.hasRuntime).toBe(true);
  });

  it('search + sort re-derive the rows; Sort mode resets to the sequence order', () => {
    const { result } = renderHook(() => useClassicConsolePage(), { wrapper: wrapper() });
    act(() => result.current.toggleSort('name'));
    act(() => result.current.toggleSort('name'));
    expect(result.current.sortDir).toBe('desc');
    expect(result.current.allRows[0].monitor.name).toBe('Cam 3');
    act(() => result.current.setSearch('cam 1'));
    expect(result.current.allRows.map((r) => r.monitor.id)).toEqual([1]);
    act(() => result.current.setSearch(''));
    act(() => result.current.toggleSortMode());
    expect(result.current.sortMode).toBe(true);
    expect(result.current.sortKey).toBe('sequence');
    expect(result.current.sortDir).toBe('asc');
  });

  it('selection drives Edit (navigates with ?edit) and Delete (confirms, deletes, clears)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { result } = renderHook(() => useClassicConsolePage(), { wrapper: wrapper() });
    act(() => result.current.toggleSelected(3));
    act(() => result.current.toggleSelected(1));
    act(() => result.current.editSelected());
    // "first selected" follows the table order (sequence asc → 3 before 1).
    expect(navigate).toHaveBeenCalledWith({ to: '/monitors/$monitorId', params: { monitorId: '3' }, search: { edit: true } });
    act(() => result.current.deleteSelected());
    await waitFor(() => expect(deleted.sort()).toEqual(['1', '3']));
    await waitFor(() => expect(result.current.selectedIds.size).toBe(0));
    expect(useToastStore.getState().toasts.at(-1)?.tone).toBe('success');
  });

  it('bulk Select patches only the chosen modes on every selected monitor', async () => {
    const { result } = renderHook(() => useClassicConsolePage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.pageSize).toBe(2));
    act(() => result.current.toggleAllOnPage());
    expect(result.current.selectedIds.size).toBe(2);
    act(() => result.current.openBulk());
    act(() => result.current.applyBulk({ recording: 'Always' }));
    await waitFor(() => expect(patched).toHaveLength(2));
    expect(patched.every((p) => JSON.stringify(p.body) === JSON.stringify({ recording: 'Always' }))).toBe(true);
    await waitFor(() => expect(result.current.bulkOpen).toBe(false));
  });

  it('reorder renumbers only the monitors whose sequence changed', async () => {
    const { result } = renderHook(() => useClassicConsolePage(), { wrapper: wrapper() });
    act(() => result.current.reorder([2, 1, 3]));
    await waitFor(() => expect(patched).toHaveLength(2));
    expect(patched.map((p) => [p.id, p.body])).toEqual(expect.arrayContaining([['1', { sequence: 2 }], ['3', { sequence: 3 }]]));
  });

  it('?new=true opens the Add dialog; a failed delete toasts the API error', async () => {
    mockSearch = { new: true };
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    server.use(http.delete('/api/v3/monitors/:id', () => HttpResponse.json({ error: 'nope' }, { status: 500 })));
    const { result } = renderHook(() => useClassicConsolePage(), { wrapper: wrapper() });
    expect(result.current.addOpen).toBe(true);
    act(() => result.current.toggleSelected(1));
    act(() => result.current.deleteSelected());
    await waitFor(() => expect(useToastStore.getState().toasts.at(-1)?.tone).toBe('error'));
  });

  it('column gates: server column needs a server, storage needs >1 area, hidden columns hide', async () => {
    const { result } = renderHook(() => useClassicConsolePage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.showServer).toBe(true));
    expect(result.current.showStorage).toBe(false);
    expect(result.current.columns.isVisible('manufacturer')).toBe(false);
    act(() => result.current.columns.toggle('manufacturer'));
    expect(result.current.columns.isVisible('manufacturer')).toBe(true);
  });
});

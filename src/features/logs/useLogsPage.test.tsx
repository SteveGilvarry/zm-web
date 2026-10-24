import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw/http';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import { fittedLogsPageSize, useLogsPage, type LogsSearchParams } from './useLogsPage';

// The hook reads its filters from the URL and writes them back through
// `navigate({ search })`. Shim both so we can drive and observe the URL.
let mockSearch: LogsSearchParams = {};
const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useSearch: () => mockSearch,
  useNavigate: () => mockNavigate,
}));

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', user: null, isAuthenticated: true,
  });
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  server.resetHandlers();
  mockSearch = {};
  components = ['web_php', 'zmc', 'zmc_m1', 'zmfilter'];
  mockNavigate.mockReset();
  window.localStorage.clear();
});
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

/** Resolve the functional `search` updater of the last navigate() call. */
function lastSearch(prev: LogsSearchParams = {}): LogsSearchParams {
  const arg = mockNavigate.mock.calls.at(-1)?.[0] as { search: (p: LogsSearchParams) => LogsSearchParams };
  return arg.search(prev);
}

function wrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

// ZoneMinder levels as the live box writes them: -2 ERR, -1 WAR, 0 INF.
const logs = [
  { id: 1, time_key: '1780000000', component: 'zmc', pid: 10, level: -2, code: 'ERR', message: 'capture failed', file: 'zm_monitor.cpp', line: 12, server_id: null },
  { id: 2, time_key: '1780000001', component: 'zmfilter', pid: 11, level: 0, code: 'INF', message: 'filter ran', file: null, line: null, server_id: null },
  { id: 3, time_key: '1780000002', component: 'zmc', pid: 10, level: -1, code: 'WAR', message: 'dropping frames', file: null, line: null, server_id: null },
];

let logRequests: URLSearchParams[] = [];
/** What `GET /logs/components` answers; null = the route is missing (older zm-api). */
let components: string[] | null = ['web_php', 'zmc', 'zmc_m1', 'zmfilter'];
/** `ZM_WEB_REFRESH_LOGS` the stubbed config table reports; 0 = auto refresh off. */
let refreshLogs = 30;

function stub() {
  logRequests = [];
  refreshLogs = 30;
  server.use(
    http.get('/api/v3/logs/components', () =>
      components ? HttpResponse.json(components) : HttpResponse.json({ message: 'nope' }, { status: 404 })),
    http.get('/api/v3/logs', ({ request }) => {
      logRequests.push(new URL(request.url).searchParams);
      return HttpResponse.json({
        items: logs, total: 3, per_page: 50, current_page: 1, last_page: 4, total_unfiltered: 1200,
      });
    }),
    http.get('/api/v3/servers', () =>
      HttpResponse.json({ items: [], total: 0, per_page: 100, current_page: 1, last_page: 1 }),
    ),
    // `useDateTimeFormat` reads ZM_*_FORMAT_PATTERN / ZM_TIMEZONE; blank
    // means "locale default", which is what these tests want.
    http.get('/api/v3/configs/:name', ({ params }) =>
      HttpResponse.json({ name: String(params.name), value: '' })),
    http.get('/api/v3/configs', () =>
      HttpResponse.json({
        items: [{ id: 1, name: 'ZM_WEB_REFRESH_LOGS', value: String(refreshLogs), type: 'integer', category: 'web', readonly: 0, private: 0, system: 0 }],
        total: 1, per_page: 1000, current_page: 1, last_page: 1,
      })),
  );
}

describe('useLogsPage', () => {
  it('loads the page and summarises levels', async () => {
    stub();
    const { result } = renderHook(() => useLogsPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.logs).toHaveLength(3));

    expect(result.current.total).toBe(3);
    expect(result.current.totalPages).toBe(4);
    expect(result.current.page).toBe(1);
    expect(result.current.showServerFilter).toBe(false);
    expect(result.current.summary).toEqual({ errors: 1, warnings: 1, info: 1, debug: 0 });
    // Nothing is filtered client-side any more, so the page is what the
    // server sent.
    expect(logRequests[0].get('min_level')).toBeNull();
    expect(logRequests[0].get('sort')).toBe('desc');
  });

  it('sends the severity threshold as min_level, by name', async () => {
    mockSearch = { min_level: 'warning' };
    stub();
    const { result } = renderHook(() => useLogsPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(logRequests[0].get('min_level')).toBe('warning');
    expect(result.current.minLevel).toBe('warning');
    // The rows are whatever the server answered — no second pass here.
    expect(result.current.logs).toHaveLength(3);
  });

  it('sends the message search, the date range and the sort as query params', async () => {
    mockSearch = {
      q: 'filter ran',
      start: '2026-06-01T10:00:00Z',
      end: '2026-06-01T11:00:00Z',
      sort: 'asc',
    };
    stub();
    const { result } = renderHook(() => useLogsPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const q = logRequests[0];
    expect(q.get('search')).toBe('filter ran');
    expect(q.get('start')).toBe(String(Date.UTC(2026, 5, 1, 10) / 1000));
    expect(q.get('end')).toBe(String(Date.UTC(2026, 5, 1, 11) / 1000));
    expect(q.get('sort')).toBe('asc');
    expect(result.current.sort).toBe('asc');
  });

  it('toggles the time-column sort between desc (default) and asc', async () => {
    stub();
    const { result } = renderHook(() => useLogsPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.toggleSort());
    const call = mockNavigate.mock.calls[0][0] as { search: (p: LogsSearchParams) => LogsSearchParams };
    expect(call.search({})).toEqual({ sort: 'asc' });
  });

  it('clears logs through DELETE /logs with the filters on screen', async () => {
    mockSearch = { component: 'zmc', min_level: 'error', q: 'boom' };
    stub();
    let deleted: URLSearchParams | null = null;
    server.use(http.delete('/api/v3/logs', ({ request }) => {
      deleted = new URL(request.url).searchParams;
      return HttpResponse.json({ message: 'Deleted 12 log entries' });
    }));
    const { result } = renderHook(() => useLogsPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.clearIsFiltered).toBe(true);
    act(() => result.current.askClear());
    expect(result.current.confirmingClear).toBe(true);

    act(() => result.current.confirmClear());
    await waitFor(() => expect(result.current.clearedMessage).toBe('Deleted 12 log entries'));
    expect(result.current.confirmingClear).toBe(false);
    expect(deleted!.get('component')).toBe('zmc');
    expect(deleted!.get('min_level')).toBe('error');
    expect(deleted!.get('search')).toBe('boom');
  });

  it('reports an unfiltered clear as such (no query params at all)', async () => {
    stub();
    let deleted: URLSearchParams | null = null;
    server.use(http.delete('/api/v3/logs', ({ request }) => {
      deleted = new URL(request.url).searchParams;
      return HttpResponse.json({ message: 'Deleted 900 log entries' });
    }));
    const { result } = renderHook(() => useLogsPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.clearIsFiltered).toBe(false);
    act(() => result.current.confirmClear());
    await waitFor(() => expect(result.current.clearedMessage).not.toBeNull());
    expect([...deleted!.keys()]).toEqual([]);
  });

  it('offers a page-size selector that persists and rewinds to page 1', async () => {
    stub();
    const { result } = renderHook(() => useLogsPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // Legacy fits the first page to the window (`logpanel.php:37-48`):
    // jsdom's 768 px leaves room for 20 rows, which joins the page list.
    expect(result.current.pageSize).toBe(20);
    expect(result.current.pageSizeOptions).toEqual([10, 20, 25, 50, 100, 200, 300, 400, 500]);

    act(() => result.current.setPageSize(200));
    expect(result.current.pageSize).toBe(200);
    expect(window.localStorage.getItem('zm-web.logs.pageSize')).toBe('200');
    const call = mockNavigate.mock.calls[0][0] as { search: (p: LogsSearchParams) => LogsSearchParams };
    expect(call.search({ page: 3 })).toEqual({});

    act(() => result.current.setPageSize(7));
    expect(result.current.pageSize).toBe(200);
    // Once picked, the size comes off the list again.
    expect(result.current.pageSizeOptions).toEqual([10, 25, 50, 100, 200, 300, 400, 500]);
  });

  it('fits the first page to the window as legacy does, clamped to 10..100', () => {
    expect(fittedLogsPageSize(768)).toBe(20);
    expect(fittedLogsPageSize(1440)).toBe(45);
    expect(fittedLogsPageSize(300)).toBe(10);
    expect(fittedLogsPageSize(5000)).toBe(100);
    expect(fittedLogsPageSize(undefined)).toBe(25);
  });

  it('keeps a remembered page size over the fitted one', async () => {
    window.localStorage.setItem('zm-web.logs.pageSize', '100');
    stub();
    const { result } = renderHook(() => useLogsPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.pageSize).toBe(100);
    expect(logRequests[0].get('page_size')).toBe('100');
  });

  it('starts auto refresh on when ZM_WEB_REFRESH_LOGS is set, and the toggle flips it', async () => {
    stub();
    const { result } = renderHook(() => useLogsPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.autoRefresh).toBe(true));
    expect(result.current.refreshSeconds).toBe(30);

    act(() => result.current.toggleAutoRefresh());
    expect(result.current.autoRefresh).toBe(false);
    act(() => result.current.toggleAutoRefresh());
    expect(result.current.autoRefresh).toBe(true);
  });

  it('starts auto refresh off when ZM_WEB_REFRESH_LOGS is 0, as legacy does', async () => {
    stub();
    refreshLogs = 0;
    const { result } = renderHook(() => useLogsPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await waitFor(() => expect(result.current.autoRefresh).toBe(false));
    // The toggle still works, and falls back to a sane interval.
    act(() => result.current.toggleAutoRefresh());
    expect(result.current.autoRefresh).toBe(true);
    expect(result.current.refreshSeconds).toBe(30);
  });

  it('mirrors the URL q param into the search box draft', async () => {
    mockSearch = { q: 'filter ran', page: 3 };
    stub();
    const { result } = renderHook(() => useLogsPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.page).toBe(3);
    expect(result.current.searchDraft).toBe('filter ran');
  });

  it('writes filter changes to the URL and drops empty keys', async () => {
    mockSearch = { component: 'zmc', page: 2 };
    stub();
    const { result } = renderHook(() => useLogsPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setSearch({ min_level: 'error', page: undefined }));
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    const call = mockNavigate.mock.calls[0][0] as {
      search: (prev: LogsSearchParams) => LogsSearchParams;
      replace: boolean;
    };
    expect(call.replace).toBe(true);
    expect(call.search({ component: 'zmc', page: 2 })).toEqual({ component: 'zmc', min_level: 'error' });
  });

  it('lists the components the table holds, from GET /logs/components', async () => {
    mockSearch = { component: 'zmaudit' };
    stub();
    const { result } = renderHook(() => useLogsPage(), { wrapper: wrapper() });
    // The applied component is offered even when the table no longer has it.
    await waitFor(() => expect(result.current.allComponents)
      .toEqual(['web_php', 'zmaudit', 'zmc', 'zmc_m1', 'zmfilter']));
  });

  it('falls back to the components on the page when the route is missing', async () => {
    components = null;
    stub();
    const { result } = renderHook(() => useLogsPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.logs).toHaveLength(3));
    expect(result.current.allComponents).toEqual(['zmc', 'zmfilter']);
  });

  it('sends exact levels as a level comma list on the inverted scale', async () => {
    mockSearch = { level: 'DBG,ERR,PNC,AUD,OFF' };
    stub();
    const { result } = renderHook(() => useLogsPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.levels).toEqual(['DBG', 'ERR', 'PNC', 'AUD', 'OFF']);
    expect(logRequests[0].get('level')).toBe('1,-2,-4,-5,-6');
    expect(logRequests[0].get('min_level')).toBeNull();
  });

  it('keeps exact levels and the threshold apart: setting one drops the other', async () => {
    mockSearch = { min_level: 'error', page: 2 };
    stub();
    const { result } = renderHook(() => useLogsPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setLevels(['WAR', 'DBG']));
    expect(lastSearch({ min_level: 'error', page: 2 })).toEqual({ level: 'DBG,WAR' });

    act(() => result.current.setLevels([]));
    expect(lastSearch({ level: 'ERR' })).toEqual({});

    act(() => result.current.setMinLevel('warning'));
    expect(lastSearch({ level: 'ERR', page: 3 })).toEqual({ min_level: 'warning' });
  });

  it('asks for the unfiltered total and reports it as Available', async () => {
    stub();
    const { result } = renderHook(() => useLogsPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.totalUnfiltered).toBe(1200));
    expect(logRequests[0].get('unfiltered_total')).toBe('true');
  });

  it('sorts on any column through sort_by: a new column ascends, the same one flips', async () => {
    stub();
    const { result } = renderHook(() => useLogsPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.sortBy).toBe('time');
    // Time is the default column, so it never reaches the wire.
    expect(logRequests[0].get('sort_by')).toBeNull();

    act(() => result.current.toggleSort('component'));
    expect(lastSearch({ page: 4 })).toEqual({ sort_by: 'component', sort: 'asc' });
  });

  it('flips a sorted column and sends sort_by with the direction', async () => {
    mockSearch = { sort_by: 'pid', sort: 'asc' };
    stub();
    const { result } = renderHook(() => useLogsPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(logRequests[0].get('sort_by')).toBe('pid');
    expect(logRequests[0].get('sort')).toBe('asc');

    act(() => result.current.toggleSort('pid'));
    expect(lastSearch({ sort_by: 'pid', sort: 'asc' })).toEqual({ sort_by: 'pid' });
    act(() => result.current.toggleSort());
    expect(lastSearch({ sort_by: 'pid', sort: 'asc' })).toEqual({ sort: 'asc' });
  });

  it('ticks rows, ticks the page from the header box, and holds auto refresh meanwhile', async () => {
    stub();
    const { result } = renderHook(() => useLogsPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.logs).toHaveLength(3));
    expect(result.current.clearTarget).toBe('all');
    expect(result.current.refreshPaused).toBe(false);

    act(() => result.current.toggleSelected(3));
    act(() => result.current.toggleSelected(1));
    expect(result.current.selectedIds).toEqual([1, 3]);
    expect(result.current.isSelected(3)).toBe(true);
    expect(result.current.allSelected).toBe(false);
    expect(result.current.refreshPaused).toBe(true);
    expect(result.current.clearTarget).toBe('selected');

    act(() => result.current.toggleSelected(3));
    expect(result.current.selectedIds).toEqual([1]);

    act(() => result.current.setAllSelected(true));
    expect(result.current.allSelected).toBe(true);
    act(() => result.current.setAllSelected(false));
    expect(result.current.selectedIds).toEqual([]);
    expect(result.current.refreshPaused).toBe(false);
  });

  it('drops the selection when the view changes', async () => {
    stub();
    const { result, rerender } = renderHook(() => useLogsPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.logs).toHaveLength(3));
    act(() => result.current.toggleSelected(2));
    expect(result.current.selectedIds).toEqual([2]);

    mockSearch = { page: 2 };
    rerender();
    expect(result.current.selectedIds).toEqual([]);
  });

  it('clears the ticked rows by id, not by the filters', async () => {
    mockSearch = { component: 'zmc', level: 'ERR' };
    stub();
    let deleted: URLSearchParams | null = null;
    server.use(http.delete('/api/v3/logs', ({ request }) => {
      deleted = new URL(request.url).searchParams;
      return HttpResponse.json({ message: 'Deleted 2 log entries' });
    }));
    const { result } = renderHook(() => useLogsPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.logs).toHaveLength(3));

    act(() => result.current.toggleSelected(1));
    act(() => result.current.toggleSelected(3));
    act(() => result.current.askClear());
    act(() => result.current.confirmClear());
    await waitFor(() => expect(result.current.clearedMessage).toBe('Deleted 2 log entries'));
    expect([...deleted!.entries()]).toEqual([['ids', '1,3']]);
    expect(result.current.selectedIds).toEqual([]);
  });

  it('clears by the exact-level filter when nothing is ticked', async () => {
    mockSearch = { level: 'WAR,ERR' };
    stub();
    let deleted: URLSearchParams | null = null;
    server.use(http.delete('/api/v3/logs', ({ request }) => {
      deleted = new URL(request.url).searchParams;
      return HttpResponse.json({ message: 'Deleted 5 log entries' });
    }));
    const { result } = renderHook(() => useLogsPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.clearTarget).toBe('filtered');
    act(() => result.current.confirmClear());
    await waitFor(() => expect(result.current.clearedMessage).not.toBeNull());
    expect(deleted!.get('level')).toBe('-1,-2');
    expect(deleted!.has('ids')).toBe(false);
  });

  it('persists column picks to localStorage', async () => {
    stub();
    const { result } = renderHook(() => useLogsPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setVisibleColumns(['timestamp', 'message']));
    expect(JSON.parse(window.localStorage.getItem('zm-web.logs.columns') ?? '[]'))
      .toEqual(['timestamp', 'message']);
  });
});

import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import { useLogsPage, type LogsSearchParams } from './useLogsPage';

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
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  server.resetHandlers();
  mockSearch = {};
  mockNavigate.mockReset();
  window.localStorage.clear();
});
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

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

function stub() {
  logRequests = [];
  server.use(
    http.get('/api/v3/logs', ({ request }) => {
      logRequests.push(new URL(request.url).searchParams);
      return HttpResponse.json({
        items: logs, total: 3, per_page: 50, current_page: 1, last_page: 4,
      });
    }),
    http.get('/api/v3/servers', () =>
      HttpResponse.json({ items: [], total: 0, per_page: 100, current_page: 1, last_page: 1 }),
    ),
    // `useDateTimeFormat` reads ZM_*_FORMAT_PATTERN / ZM_TIMEZONE; blank
    // means "locale default", which is what these tests want.
    http.get('/api/v3/configs/:name', ({ params }) =>
      HttpResponse.json({ name: String(params.name), value: '' })),
  );
}

describe('useLogsPage', () => {
  it('loads the page, summarises levels and discovers components from the data', async () => {
    stub();
    const { result } = renderHook(() => useLogsPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.logs).toHaveLength(3));

    expect(result.current.total).toBe(3);
    expect(result.current.totalPages).toBe(4);
    expect(result.current.page).toBe(1);
    expect(result.current.showServerFilter).toBe(false);
    expect(result.current.allComponents).toContain('zmfilter');
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
    expect(result.current.pageSize).toBe(50);
    expect(result.current.pageSizeOptions).toEqual([25, 50, 100, 200, 500]);

    act(() => result.current.setPageSize(200));
    expect(result.current.pageSize).toBe(200);
    expect(window.localStorage.getItem('zm-web.logs.pageSize')).toBe('200');
    const call = mockNavigate.mock.calls[0][0] as { search: (p: LogsSearchParams) => LogsSearchParams };
    expect(call.search({ page: 3 })).toEqual({});

    act(() => result.current.setPageSize(7));
    expect(result.current.pageSize).toBe(200);
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

  it('persists column picks to localStorage', async () => {
    stub();
    const { result } = renderHook(() => useLogsPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setVisibleColumns(['timestamp', 'message']));
    expect(JSON.parse(window.localStorage.getItem('zm-web.logs.columns') ?? '[]'))
      .toEqual(['timestamp', 'message']);
  });
});

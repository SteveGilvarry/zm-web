import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import { formatLogTime, useLogsPage, type LogsSearchParams } from './useLogsPage';

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

const logs = [
  { id: 1, time_key: '1780000000', component: 'zmc', pid: 10, level: -1, code: 'ERR', message: 'capture failed', file: 'zm_monitor.cpp', line: 12, server_id: null },
  { id: 2, time_key: '1780000001', component: 'zmfilter', pid: 11, level: 1, code: 'INF', message: 'filter ran', file: null, line: null, server_id: null },
];

function stub() {
  server.use(
    http.get('/api/v3/logs', ({ request }) =>
      HttpResponse.json({
        items: logs, total: 2, per_page: 50, current_page: 1, last_page: 4,
        // echo the query so a test can assert the backend filters
        _url: request.url,
      }),
    ),
    http.get('/api/v3/servers', () =>
      HttpResponse.json({ items: [], total: 0, per_page: 100, current_page: 1, last_page: 1 }),
    ),
  );
}

describe('formatLogTime', () => {
  it('returns the raw string when it is not a date', () => {
    expect(formatLogTime('garbage')).toBe('garbage');
  });
});

describe('useLogsPage', () => {
  it('loads the page, summarises levels and discovers components from the data', async () => {
    stub();
    const { result } = renderHook(() => useLogsPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.logs).toHaveLength(2));

    expect(result.current.total).toBe(2);
    expect(result.current.totalPages).toBe(4);
    expect(result.current.page).toBe(1);
    expect(result.current.showServerFilter).toBe(false);
    expect(result.current.allComponents).toContain('zmfilter');
    expect(result.current.summary.errors).toBe(1);
  });

  it('filters messages client-side from the URL q param', async () => {
    mockSearch = { q: 'filter ran', page: 3 };
    stub();
    const { result } = renderHook(() => useLogsPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.page).toBe(3);
    expect(result.current.logs.map((l) => l.id)).toEqual([2]);
    expect(result.current.searchDraft).toBe('filter ran');
  });

  it('writes filter changes to the URL and drops empty keys', async () => {
    mockSearch = { component: 'zmc', page: 2 };
    stub();
    const { result } = renderHook(() => useLogsPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setSearch({ level: -1, page: undefined }));
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    const call = mockNavigate.mock.calls[0][0] as {
      search: (prev: LogsSearchParams) => LogsSearchParams;
      replace: boolean;
    };
    expect(call.replace).toBe(true);
    expect(call.search({ component: 'zmc', page: 2 })).toEqual({ component: 'zmc', level: -1 });
  });

  it('persists column picks to localStorage', async () => {
    stub();
    const { result } = renderHook(() => useLogsPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setVisibleColumns(['timestamp', 'message']));
    expect(JSON.parse(window.localStorage.getItem('zm-dashboard.logs.columns') ?? '[]'))
      .toEqual(['timestamp', 'message']);
  });
});

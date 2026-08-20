import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import { useMonitorsListPage } from './useMonitorsListPage';

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', user: null, isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

const monitors = [
  { id: 1, name: 'Front Door', capturing: 'Always', width: 1920, height: 1080 },
  { id: 2, name: 'Back Yard', capturing: 'Always', width: 1920, height: 1080 },
  { id: 3, name: 'Garage', capturing: 'None', width: 640, height: 480 },
];

function stubList() {
  server.use(
    http.get('/api/v3/monitors', () =>
      HttpResponse.json({ items: monitors, total: 3, per_page: 24, current_page: 1, last_page: 1 }),
    ),
    http.get('/api/v3/live/sessions', () => HttpResponse.json([2])),
  );
}

describe('useMonitorsListPage', () => {
  it('loads the page of monitors and the live session ids', async () => {
    stubList();
    const { result } = renderHook(() => useMonitorsListPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.monitors).toHaveLength(3));
    expect(result.current.filteredMonitors).toHaveLength(3);
    expect(result.current.total).toBe(3);
    expect(result.current.totalPages).toBe(1);
    await waitFor(() => expect(result.current.liveSessionIds.has(2)).toBe(true));
  });

  it('filters by search text and by status', async () => {
    stubList();
    const { result } = renderHook(() => useMonitorsListPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.monitors).toHaveLength(3));
    await waitFor(() => expect(result.current.liveSessions).toEqual([2]));

    act(() => result.current.setSearchQuery('front'));
    expect(result.current.filteredMonitors.map((m) => m.name)).toEqual(['Front Door']);

    act(() => result.current.setSearchQuery(''));
    act(() => result.current.setStatusFilter('inactive'));
    expect(result.current.filteredMonitors.map((m) => m.id)).toEqual([3]);

    act(() => result.current.setStatusFilter('streaming'));
    expect(result.current.filteredMonitors.map((m) => m.id)).toEqual([2]);

    act(() => result.current.setStatusFilter('active'));
    expect(result.current.filteredMonitors.map((m) => m.id)).toEqual([1, 2]);
  });

  it('requestDelete asks first and only deletes on confirm', async () => {
    stubList();
    let deleted: string[] = [];
    server.use(
      http.delete('/api/v3/monitors/:id', ({ params }) => {
        deleted = [...deleted, params.id as string];
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const confirmSpy = vi.spyOn(window, 'confirm');
    const { result } = renderHook(() => useMonitorsListPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.monitors).toHaveLength(3));

    confirmSpy.mockReturnValue(false);
    act(() => result.current.requestDelete(3, 'Garage'));
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('"Garage"'));
    await new Promise((r) => setTimeout(r, 30));
    expect(deleted).toEqual([]);

    confirmSpy.mockReturnValue(true);
    act(() => result.current.requestDelete(3, 'Garage'));
    await waitFor(() => expect(deleted).toEqual(['3']));
  });

  it('toggles view mode and the add dialog', async () => {
    stubList();
    const { result } = renderHook(() => useMonitorsListPage(), { wrapper: makeWrapper() });
    expect(result.current.viewMode).toBe('grid');
    act(() => result.current.setViewMode('list'));
    expect(result.current.viewMode).toBe('list');
    expect(result.current.showAdd).toBe(false);
    act(() => result.current.openAdd());
    expect(result.current.showAdd).toBe(true);
    act(() => result.current.closeAdd());
    expect(result.current.showAdd).toBe(false);
  });
});

import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/components/common/toastStore';
import { useMonitorEvents } from './useMonitorEvents';

const requests: URL[] = [];
const deleted: string[] = [];
const server = setupServer(
  http.get('/api/v3/events', ({ request }) => {
    const url = new URL(request.url);
    requests.push(url);
    const page = Number(url.searchParams.get('page') ?? '1');
    return HttpResponse.json({
      items: [{ id: page * 10 + 1, monitor_id: 1 }, { id: page * 10 + 2, monitor_id: 1 }],
      total: 5, per_page: 2, current_page: page, last_page: 3,
    });
  }),
  http.get('/api/v3/configs/:name', ({ params }) =>
    HttpResponse.json({ name: params.name, value: params.name === 'ZM_WEB_EVENTS_PER_PAGE' ? '2' : '1' })),
  http.delete('/api/v3/events/:id', ({ params }) => { deleted.push(String(params.id)); return new HttpResponse(null, { status: 204 }); }),
);
beforeAll(() => {
  useAuthStore.setState({ accessToken: 'tok', refreshToken: 't', user: null, isAuthenticated: true });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => { server.resetHandlers(); requests.length = 0; deleted.length = 0; useToastStore.getState().clear(); });
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
}

describe('useMonitorEvents', () => {
  it('asks for the monitor, newest first, at the configured page size', async () => {
    const { result } = renderHook(() => useMonitorEvents(1), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.events).toHaveLength(2));
    await waitFor(() => expect(result.current.pageSize).toBe(2));
    const last = requests.at(-1)!;
    expect(last.searchParams.get('monitor_id')).toBe('1');
    expect(last.searchParams.get('sort')).toBe('start_time');
    expect(last.searchParams.get('direction')).toBe('desc');
    expect(result.current.total).toBe(5);
    expect(result.current.accessToken).toBe('tok');
  });

  it('pages, sorts (same field flips), and resets to page 1 on a sort change', async () => {
    const { result } = renderHook(() => useMonitorEvents(1), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.events).toHaveLength(2));
    act(() => result.current.setPage(2));
    await waitFor(() => expect(result.current.events[0]?.id).toBe(21));
    act(() => result.current.toggleSort('length'));
    expect(result.current.sortField).toBe('length');
    expect(result.current.sortDir).toBe('asc');
    expect(result.current.page).toBe(1);
    act(() => result.current.toggleSort('length'));
    expect(result.current.sortDir).toBe('desc');
  });

  it('deletes the selection after confirming and toasts the count', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { result } = renderHook(() => useMonitorEvents(1), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.events).toHaveLength(2));
    act(() => { result.current.toggleSelected(11); result.current.toggleSelected(12); });
    act(() => result.current.deleteSelected());
    await waitFor(() => expect(deleted.sort()).toEqual(['11', '12']));
    await waitFor(() => expect(result.current.selectedIds.size).toBe(0));
    expect(useToastStore.getState().toasts.at(-1)?.tone).toBe('success');
  });

  it('does nothing when the operator declines', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { result } = renderHook(() => useMonitorEvents(1), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.events).toHaveLength(2));
    act(() => result.current.toggleSelected(11));
    act(() => result.current.deleteSelected());
    expect(deleted).toEqual([]);
    expect(result.current.selectedIds.has(11)).toBe(true);
  });
});

import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { configListHandler } from '@/test/msw/handlers';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import type { EventFramesSearchParams } from '@/routes/events/$eventId_.frames';
import { useEventFramesPage } from './useEventFramesPage';

// The hook reads page / page_size from the route and writes them back with
// `navigate({ search })`. Shim both so we can drive and observe the URL.
let mockSearch: EventFramesSearchParams = {};
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
  mockNavigate.mockReset();
  mockSearch = {};
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

function frame(frame_id: number, over: Record<string, unknown> = {}) {
  return {
    id: 1000 + frame_id, event_id: 42, frame_id, type: 'Normal', score: 0,
    time_stamp: `2026-06-03T12:00:${String(frame_id).padStart(2, '0')}Z`,
    delta: String(frame_id), ...over,
  };
}

/** Query strings of every /frames request, for asserting what hit the server. */
let frameRequests: URLSearchParams[] = [];

function stub(
  frames = [frame(1), frame(2, { type: 'Alarm', score: 37 }), frame(3, { score: 12 })],
  configs: Record<string, string> = { ZM_WEB_EVENTS_PER_PAGE: '25' },
  total = 120,
) {
  frameRequests = [];
  server.use(
    http.get('/api/v3/events/:id', ({ params }) =>
      HttpResponse.json({ id: Number(params.id), monitor_id: 1, storage_id: 1, name: 'Event 42' }),
    ),
    http.get('/api/v3/frames', ({ request }) => {
      const q = new URL(request.url).searchParams;
      frameRequests.push(q);
      const per = Number(q.get('page_size') ?? 25);
      return HttpResponse.json({
        items: frames, total, per_page: per,
        current_page: Number(q.get('page') ?? 1), last_page: Math.ceil(total / per),
      });
    }),
    configListHandler(configs),
    http.get('/api/v3/configs/:name', ({ params }) => {
      const name = String(params.name);
      return name in configs
        ? HttpResponse.json({ name, value: configs[name], type: 'string' })
        : HttpResponse.json({ kind: 'NOT_FOUND' }, { status: 404 });
    }),
  );
}

/** The `search` updater the hook hands to navigate, applied to `prev`. */
function applyNavigate(prev: EventFramesSearchParams): EventFramesSearchParams {
  const call = mockNavigate.mock.calls.at(-1)?.[0] as {
    search: (p: EventFramesSearchParams) => EventFramesSearchParams; replace?: boolean;
  };
  expect(call.replace).toBe(true);
  return call.search(prev);
}

describe('useEventFramesPage', () => {
  it('requests the event frames with event_id, page and page_size and derives the page max score', async () => {
    stub();
    const { result } = renderHook(() => useEventFramesPage(42), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.frames).toHaveLength(3));

    const q = frameRequests.at(-1)!;
    expect(q.get('event_id')).toBe('42');
    expect(q.get('page')).toBe('1');
    expect(q.get('page_size')).toBe('25');

    expect(result.current.total).toBe(120);
    expect(result.current.totalPages).toBe(5);
    expect(result.current.maxScore).toBe(37);
    // 0 is legacy's "All".
    expect(result.current.pageSizeOptions).toEqual([10, 25, 50, 100, 200, 0]);
    await waitFor(() => expect(result.current.event?.name).toBe('Event 42'));
  });

  it('reads page and page_size from the URL', async () => {
    mockSearch = { page: 3, page_size: 50 };
    stub();
    const { result } = renderHook(() => useEventFramesPage(42), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.page).toBe(3);
    expect(result.current.pageSize).toBe(50);
    const q = frameRequests.at(-1)!;
    expect(q.get('page')).toBe('3');
    expect(q.get('page_size')).toBe('50');
  });

  it('falls back to ZM_WEB_EVENTS_PER_PAGE for the page size', async () => {
    stub(undefined, { ZM_WEB_EVENTS_PER_PAGE: '100' });
    const { result } = renderHook(() => useEventFramesPage(42), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.pageSize).toBe(100));
    await waitFor(() => expect(frameRequests.at(-1)!.get('page_size')).toBe('100'));
  });

  it('navigates (replace) on setPage and drops page 1 from the URL', async () => {
    stub();
    const { result } = renderHook(() => useEventFramesPage(42), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setPage(2));
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(applyNavigate({ page_size: 50 })).toEqual({ page: 2, page_size: 50 });

    act(() => result.current.setPage(1));
    expect(applyNavigate({ page: 2, page_size: 50 })).toEqual({ page_size: 50 });
  });

  it('resets to the first page when the page size changes', async () => {
    stub();
    const { result } = renderHook(() => useEventFramesPage(42), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setPageSize(200));
    expect(applyNavigate({ page: 4, page_size: 25 })).toEqual({ page_size: 200 });
  });

  it('surfaces a failed frames request', async () => {
    stub();
    server.use(
      http.get('/api/v3/frames', () =>
        HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'frames table locked' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useEventFramesPage(42), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.frames).toEqual([]);
    expect(result.current.maxScore).toBe(0);
  });
});

describe('useEventFramesPage — client-side table controls', () => {
  it('sorts by any column, flipping direction on a second click', async () => {
    stub();
    const { result } = renderHook(() => useEventFramesPage(42), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.frames).toHaveLength(3));

    act(() => result.current.toggleSort('score'));
    expect(result.current.dir).toBe('asc');
    expect(result.current.frames.map((f) => f.score)).toEqual([0, 12, 37]);

    act(() => result.current.toggleSort('score'));
    expect(result.current.dir).toBe('desc');
    expect(result.current.frames.map((f) => f.score)).toEqual([37, 12, 0]);

    act(() => result.current.toggleSort('frame_id'));
    expect(result.current.sort).toBe('frame_id');
    expect(result.current.dir).toBe('asc');
  });

  it('searches the visible columns', async () => {
    stub();
    const { result } = renderHook(() => useEventFramesPage(42), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.frames).toHaveLength(3));

    act(() => result.current.setQuery('alarm'));
    expect(result.current.frames.map((f) => f.frame_id)).toEqual([2]);

    // Hide Type and the same search matches nothing.
    act(() => result.current.toggleColumn('type'));
    expect(result.current.frames).toHaveLength(0);
  });

  it('starts with Event Id hidden and restores the defaults on reset', async () => {
    stub();
    const { result } = renderHook(() => useEventFramesPage(42), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.frames).toHaveLength(3));

    expect(result.current.isVisible('event_id')).toBe(false);
    expect(result.current.visibleColumns).not.toContain('event_id');

    act(() => result.current.toggleColumn('event_id'));
    expect(result.current.isVisible('event_id')).toBe(true);

    act(() => result.current.toggleColumn('score'));
    act(() => result.current.resetColumns());
    expect(result.current.isVisible('score')).toBe(true);
    expect(result.current.isVisible('event_id')).toBe(false);
  });

  it('fetches every frame of the event for the "All" page size', async () => {
    mockSearch = { page_size: 0 };
    stub();
    const { result } = renderHook(() => useEventFramesPage(42), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.frames).toHaveLength(3));

    // `getAllFramesForEvent` walks pages of 500 and stops at the last one.
    expect(frameRequests.at(0)!.get('page_size')).toBe('500');
    expect(result.current.totalPages).toBe(1);
    expect(result.current.total).toBe(3);
  });

  it('exports the visible rows as CSV', async () => {
    stub();
    const { result } = renderHook(() => useEventFramesPage(42), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.frames).toHaveLength(3));

    const created = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:csv');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    act(() => result.current.setQuery('Alarm'));
    act(() => result.current.exportCsv());

    expect(click).toHaveBeenCalled();
    const blob = created.mock.calls[0][0] as Blob;
    const text = await blob.text();
    expect(text).toContain('Frame Id,Type,Time Stamp,Time Delta,Score');
    expect(text).toContain('Alarm');
    // The search narrowed the export to the one matching row.
    expect(text.trim().split('\n')).toHaveLength(2);

    vi.restoreAllMocks();
  });
});

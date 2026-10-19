/**
 * The Timeline hook against MSW: the window comes from the URL or, failing
 * that, from the first and last matching event; the events query is the
 * events filter plus legacy's overlap test; pan / zoom / click-through
 * navigate with the filter carried along.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import { makeEvent, makeMonitor } from '@/test/fixtures';
import { timelineAst } from './useTimelinePage';
import type { FilterAstQuery } from '@/api/filters';

let mockSearch: Record<string, unknown> = {};
const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useSearch: () => mockSearch,
  useNavigate: () => mockNavigate,
}));

const at = (h: number, m: number, s = 0) => Math.floor(new Date(2026, 7, 21, h, m, s).getTime() / 1000);
const iso = (t: number) => new Date(t * 1000).toISOString();
const paged = <T,>(items: T[]) => ({ items, total: items.length, per_page: 1000, current_page: 1, last_page: 1 });

const first = makeEvent({ id: 21, monitor_id: 1, name: 'First', start_date_time: iso(at(14, 3)), end_date_time: iso(at(14, 4)), max_score: 0 });
const last = makeEvent({ id: 22, monitor_id: 2, name: 'Last', start_date_time: iso(at(15, 50)), end_date_time: iso(at(15, 55)), max_score: 0 });

const previews: Array<{ ast: FilterAstQuery; pageSize: string | null }> = [];
const server = setupServer(
  http.get('/api/v3/monitors', () => HttpResponse.json(paged([
    makeMonitor({ id: 1, name: 'Front', web_colour: '#ff0000' }),
    makeMonitor({ id: 2, name: 'Back', web_colour: '#00ff00' }),
  ]))),
  http.get('/api/v3/frames', () => HttpResponse.json(paged([]))),
  http.get('/api/v3/groups-monitors', () => HttpResponse.json(paged([
    { id: 1, group_id: 5, monitor_id: 2 },
  ]))),
  http.get('/api/v3/tags/:id', () => HttpResponse.json({
    id: 9, name: 'car', events: [{ id: 22, monitor_id: 2, name: 'Last' }], total_events: 1, current_page: 1, last_page: 1, per_page: 1000,
  })),
  http.post('/api/v3/filters/preview', async ({ request }) => {
    const ast = (await request.json()) as FilterAstQuery;
    const pageSize = new URL(request.url).searchParams.get('page_size');
    previews.push({ ast, pageSize });
    if (pageSize === '1') return HttpResponse.json(paged([ast.sort?.field === 'start_time' ? first : last]));
    return HttpResponse.json(paged([first, last]));
  }),
);

beforeAll(() => {
  useAuthStore.setState({ accessToken: 'tok', refreshToken: 'r', user: null, isAuthenticated: true });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  server.resetHandlers();
  mockSearch = {};
  mockNavigate.mockReset();
  previews.length = 0;
});
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

async function mount() {
  const { useTimelinePage } = await import('./useTimelinePage');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => useTimelinePage(), { wrapper });
}

const rulesOf = (ast: FilterAstQuery) => (ast.where as { rules: unknown[] }).rules;

describe('useTimelinePage', () => {
  it('with no window, spans the first to the last matching event, snapped to the scale', async () => {
    mockSearch = { archived: false };
    const { result } = await mount();
    await waitFor(() => expect(result.current.chart?.rows).toHaveLength(2));
    const chart = result.current.chart!;
    expect(chart.lo).toBe(at(14, 0));
    expect(chart.hi).toBe(at(15, 59, 59));
    expect(chart.title).toBe('14:00 - 15:59, 21 Aug 2026');

    const range = previews.filter((p) => p.pageSize === '1');
    expect(range.map((p) => p.ast.sort)).toEqual(expect.arrayContaining([
      { field: 'start_time', dir: 'asc' }, { field: 'end_time', dir: 'desc' },
    ]));
    const events = previews.find((p) => p.pageSize === '1000')!;
    expect(rulesOf(events.ast)).toEqual(expect.arrayContaining([
      { field: 'archived', op: 'eq', value: 0 },
      { field: 'start_time', op: 'lte', value: iso(at(15, 59, 59)).replace('.000', '') },
      { field: 'end_time', op: 'gte', value: iso(at(14, 0)).replace('.000', '') },
    ]));
    // Each monitor's readout opens on its first event, frame 1.
    expect(result.current.previews.map((p) => [p.monitorId, p.preview?.event.id, p.preview?.frame])).toEqual([
      [1, 21, 1], [2, 22, 1],
    ]);
    expect(result.current.previews[0].preview?.imageUrl).toContain('/events/21/frames/1/image?token=tok');
    expect(result.current.showInstructions).toBe(false);
    expect(result.current.eventsSearch).toEqual({
      archived: false, start: '2026-08-21T14:00:00', end: '2026-08-21T15:59:59',
    });
  });

  it('takes the window from the URL without asking for the range', async () => {
    mockSearch = { monitor_id: [1, 2], mid_time: '2026-08-21 15:00:00', range: 7200 };
    const { result } = await mount();
    await waitFor(() => expect(result.current.chart?.rows).toHaveLength(2));
    expect(previews.some((p) => p.pageSize === '1')).toBe(false);
    expect(rulesOf(previews[0].ast)).toContainEqual({ field: 'monitor_id', op: 'in', value: [1, 2] });
    expect(result.current.minInput).toBe('2026-08-21T14:00:00');
    expect(result.current.maxInput).toBe('2026-08-21T15:59:59');
  });

  it('pans by a whole window, zooms out by the scale factor and zooms in to a band', async () => {
    mockSearch = { monitor_id: 1, min_time: '2026-08-21 14:00:00', max_time: '2026-08-21 15:59:59' };
    const { result } = await mount();
    await waitFor(() => expect(result.current.chart).not.toBeNull());
    const filter = { monitor_id: 1 };

    act(() => result.current.panLeft());
    expect(mockNavigate).toHaveBeenLastCalledWith({
      search: { ...filter, mid_time: '2026-08-21 14:00:00', range: 7200 }, replace: true,
    });
    act(() => result.current.panRight());
    expect(mockNavigate).toHaveBeenLastCalledWith({
      search: { ...filter, mid_time: '2026-08-21 15:59:59', range: 7200 }, replace: true,
    });
    act(() => result.current.zoomOut());
    expect(mockNavigate).toHaveBeenLastCalledWith({
      search: { ...filter, mid_time: '2026-08-21 15:00:00', range: 43200 }, replace: true,
    });
    act(() => result.current.zoomTo(result.current.chart!.zoomBands[0]));
    expect(mockNavigate).toHaveBeenLastCalledWith({
      search: { ...filter, min_time: '2026-08-21 14:00:00', max_time: '2026-08-21 14:10:00' }, replace: true,
    });
    act(() => result.current.setWindow('2026-08-21T09:00', ''));
    expect(mockNavigate).toHaveBeenLastCalledWith({
      search: { ...filter, min_time: '2026-08-21 09:00:00', max_time: undefined }, replace: true,
    });
  });

  it('hovering a bar swaps that monitor’s readout; clicking opens the event with the filter', async () => {
    mockSearch = { monitor_id: [1, 2], group: 3, min_time: '2026-08-21 14:00:00', max_time: '2026-08-21 15:59:59' };
    const { result } = await mount();
    await waitFor(() => expect(result.current.chart?.rows).toHaveLength(2));
    const slot = { ...result.current.chart!.rows[1].slots[0], frame: 7 };
    act(() => result.current.preview(slot));
    expect(result.current.previews[1].preview).toMatchObject({ frame: 7, monitorName: 'Back' });

    act(() => result.current.openEvent(22));
    expect(mockNavigate).toHaveBeenLastCalledWith({
      to: '/events/$eventId', params: { eventId: '22' }, search: { monitor_id: [1, 2] },
    });
  });

  it('resolves a group to its monitors and a tag to its events', async () => {
    mockSearch = { group: 5, tag: 9, min_time: '2026-08-21 14:00:00', max_time: '2026-08-21 15:59:59' };
    const { result } = await mount();
    await waitFor(() => expect(result.current.chart).not.toBeNull());
    await waitFor(() => expect(previews.length).toBeGreaterThan(0));
    expect(rulesOf(previews[0].ast)).toEqual(expect.arrayContaining([
      { field: 'monitor_id', op: 'in', value: [2] },
      { field: 'id', op: 'in', value: [22] },
    ]));
  });

  it('takes several groups and several tags, as the events list sends them', async () => {
    server.use(
      http.get('/api/v3/groups-monitors', () => HttpResponse.json(paged([
        { id: 1, group_id: 5, monitor_id: 2 }, { id: 2, group_id: 6, monitor_id: 1 }, { id: 3, group_id: 7, monitor_id: 3 },
      ]))),
      http.get('/api/v3/tags/:id', ({ params }) => HttpResponse.json({
        id: Number(params.id), name: `t${params.id}`, total_events: 1, current_page: 1, last_page: 1, per_page: 1000,
        events: [{ id: params.id === '9' ? 22 : 21, monitor_id: 1, name: 'x' }],
      })),
    );
    mockSearch = { group: [5, 6], tag: [9, 11], min_time: '2026-08-21 14:00:00', max_time: '2026-08-21 15:59:59' };
    const { result } = await mount();
    await waitFor(() => expect(result.current.chart).not.toBeNull());
    await waitFor(() => expect(previews.length).toBeGreaterThan(0));
    expect(rulesOf(previews[0].ast)).toEqual(expect.arrayContaining([
      { field: 'monitor_id', op: 'in', value: [2, 1] },
      { field: 'id', op: 'in', value: expect.arrayContaining([21, 22]) },
    ]));
  });

  it('a group with no monitors draws an empty last day instead of querying', async () => {
    server.use(http.get('/api/v3/groups-monitors', () => HttpResponse.json(paged([]))));
    mockSearch = { group: 5 };
    const { result } = await mount();
    await waitFor(() => expect(result.current.chart).not.toBeNull());
    expect(result.current.chart!.rows).toEqual([]);
    expect(result.current.showInstructions).toBe(true);
    expect(previews).toHaveLength(0);
  });
});

describe('timelineAst with no filter', () => {
  it('never sends an empty rule group, which the preview route rejects', () => {
    const q = timelineAst({}, { monitorIds: null }, { field: 'start_time', dir: 'asc' });
    expect(q.where.rules).toEqual([{ field: 'id', op: 'gte', value: 1 }]);
  });
});

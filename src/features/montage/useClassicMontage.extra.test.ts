/**
 * useClassicMontage — the halves the first suite left untested: Save /
 * Delete layout (their prompts and the requests they send), the reorder
 * guards, the Width / Height / Scale stage controls, and the error paths.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import type { Monitor } from '@/types';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/components/common/toastStore';
import { useMontageStore } from '@/stores/montage';
import { useClassicMontage } from './useClassicMontage';
import { parsePositions, serialisePositions } from './layoutFormat';
import { gridLayout, leafMonitors } from './mosaic';

vi.mock('@tanstack/react-router', () => ({ useSearch: () => ({}), useNavigate: () => vi.fn() }));

const m = (id: number, over: Partial<Monitor> = {}): Monitor =>
  ({
    id, name: `Cam ${id}`, capturing: 'Always',
    width: 1920, height: 1080, orientation: 'ROTATE_0', ...over,
  }) as unknown as Monitor;

const savedPositions = serialisePositions(gridLayout(2, 1, [3, 1]), 'outside');

/** Requests captured for assertion. */
let posted: Array<{ url: string; body: unknown }> = [];
let deleted: string[] = [];

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({
    accessToken: 't', refreshToken: 't',
    user: { iat: 0, exp: 0, user: 'admin', uid: 7 } as never,
    isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  server.resetHandlers();
  posted = []; deleted = [];
  useToastStore.getState().clear();
  useMontageStore.setState({ statusPosition: 'inside', protocol: 'webrtc' });
});
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

function stubLayouts(items: unknown[] = [
  { id: 12, name: 'Zulu wall', user_id: 1, positions: savedPositions },
  { id: 13, name: 'alpha wall', user_id: 1, positions: savedPositions },
  { id: 14, name: 'Corrupt', user_id: 1, positions: 'not-json' },
]) {
  server.use(
    http.get('/api/v3/montage_layouts', () =>
      HttpResponse.json({ items, total: items.length, per_page: 200, current_page: 1, last_page: 1 })),
    http.post('/api/v3/montage_layouts', async ({ request }) => {
      const body = await request.json();
      posted.push({ url: request.url, body });
      return HttpResponse.json({ id: 99, name: (body as { name: string }).name, positions: savedPositions, user_id: 7 });
    }),
    http.delete('/api/v3/montage_layouts/:id', ({ params }) => {
      deleted.push(String(params.id));
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

function wrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

const monitors = [m(1), m(2), m(3)];

async function mounted(list = monitors) {
  const hook = renderHook(() => useClassicMontage(list), { wrapper: wrapper() });
  await waitFor(() => expect(hook.result.current.layoutOptions.some((o) => o.value === 'saved:12')).toBe(true));
  return hook;
}

describe('useClassicMontage — saved layout list', () => {
  it('sorts saved layouts by name and drops rows whose positions will not parse', async () => {
    stubLayouts();
    const { result } = await mounted();
    const savedOpts = result.current.layoutOptions.filter((o) => o.value.startsWith('saved:'));
    expect(savedOpts.map((o) => o.label)).toEqual(['alpha wall', 'Zulu wall']);
    expect(savedOpts.some((o) => o.label === 'Corrupt')).toBe(false);
  });

  it('survives the backend being unreachable — presets still work', async () => {
    server.use(http.get('/api/v3/montage_layouts', () => HttpResponse.error()));
    const { result } = renderHook(() => useClassicMontage(monitors), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.layoutOptions.length).toBeGreaterThan(0));
    expect(result.current.layoutOptions.every((o) => o.value.startsWith('preset:'))).toBe(true);
    act(() => result.current.setLayoutId('preset:4w'));
    expect(result.current.columns).toBe(4);
  });

  it('a 500 leaves the saved list empty rather than throwing', async () => {
    server.use(http.get('/api/v3/montage_layouts', () =>
      HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'MontageLayouts is locked' }, { status: 500 })));
    const { result } = renderHook(() => useClassicMontage(monitors), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.layoutOptions.length).toBeGreaterThan(0));
    expect(result.current.isSavedLayout).toBe(false);
  });

  it('falls back to the auto column count for a saved layout not named "N Wide"', async () => {
    stubLayouts();
    const { result } = await mounted();
    act(() => result.current.setLayoutId('saved:12')); // "Zulu wall"
    expect(result.current.columns).toBe(3); // autoColumns(3)
  });

  it('reads the column count out of a saved layout named "N Wide"', async () => {
    stubLayouts([{ id: 20, name: '2 Wide', user_id: 1, positions: savedPositions }]);
    const { result } = renderHook(() => useClassicMontage(monitors), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.layoutOptions.some((o) => o.value === 'saved:20')).toBe(true));
    act(() => result.current.setLayoutId('saved:20'));
    expect(result.current.columns).toBe(2);
  });
});

describe('useClassicMontage — reorder guards', () => {
  it('ignores a drop onto the same cell or onto a monitor it does not have', async () => {
    stubLayouts();
    const { result } = await mounted();
    act(() => result.current.reorder(1, 1));
    expect(result.current.monitors.map((x) => x.id)).toEqual([1, 2, 3]);
    act(() => result.current.reorder(1, 999));
    expect(result.current.monitors.map((x) => x.id)).toEqual([1, 2, 3]);
    act(() => result.current.reorder(999, 1));
    expect(result.current.monitors.map((x) => x.id)).toEqual([1, 2, 3]);
  });
});

describe('useClassicMontage — save layout', () => {
  it('prompts for a name and POSTs the current arrangement + status position', async () => {
    stubLayouts();
    useMontageStore.setState({ statusPosition: 'outside' });
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('  Front wall  ');
    const { result } = await mounted();

    act(() => result.current.reorder(3, 1)); // 3, 1, 2
    await act(async () => { result.current.save(); });
    await waitFor(() => expect(posted).toHaveLength(1));

    expect(prompt).toHaveBeenCalledWith('Layout name', '');
    const body = posted[0].body as { name: string; positions: string; user_id: number };
    expect(body.name).toBe('Front wall');
    expect(body.user_id).toBe(7);
    const parsed = parsePositions(body.positions)!;
    expect(leafMonitors(parsed.tree)).toEqual([3, 1, 2]);
    expect(parsed.statusPosition).toBe('outside');

    // On success the new row is selected and the draft order is dropped.
    await waitFor(() => expect(result.current.layoutId).toBe('saved:99'));
    expect(result.current.editMode).toBe(false);
    expect(useToastStore.getState().toasts.some((t) => /Layout "Front wall" saved/.test(t.message))).toBe(true);
  });

  it('offers the current saved layout name as the default and sends no request when cancelled', async () => {
    stubLayouts();
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue(null);
    const { result } = await mounted();
    act(() => result.current.setLayoutId('saved:12'));

    await act(async () => { result.current.save(); });
    expect(prompt).toHaveBeenCalledWith('Layout name', 'Zulu wall');
    expect(posted).toHaveLength(0);
  });

  it('treats a whitespace-only name as a cancel', async () => {
    stubLayouts();
    vi.spyOn(window, 'prompt').mockReturnValue('   ');
    const { result } = await mounted();
    await act(async () => { result.current.save(); });
    expect(posted).toHaveLength(0);
  });

  it('reports a failed save through the toast rail', async () => {
    stubLayouts();
    server.use(http.post('/api/v3/montage_layouts', () =>
      HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'duplicate name' }, { status: 500 })));
    vi.spyOn(window, 'prompt').mockReturnValue('Front wall');
    const { result } = await mounted();

    await act(async () => { result.current.save(); });
    await waitFor(() =>
      expect(useToastStore.getState().toasts.some((t) => t.tone === 'error')).toBe(true));
    expect(result.current.layoutId).toBe('preset:auto');
  });
});

describe('useClassicMontage — delete layout', () => {
  it('does nothing on a preset', async () => {
    stubLayouts();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { result } = await mounted();
    await act(async () => { result.current.remove(); });
    expect(confirm).not.toHaveBeenCalled();
    expect(deleted).toEqual([]);
  });

  it('confirms, DELETEs the row and falls back to the Auto preset', async () => {
    stubLayouts();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { result } = await mounted();
    act(() => result.current.setLayoutId('saved:12'));

    await act(async () => { result.current.remove(); });
    await waitFor(() => expect(deleted).toEqual(['12']));
    expect(confirm).toHaveBeenCalledWith('Delete layout "Zulu wall"?');
    await waitFor(() => expect(result.current.layoutId).toBe('preset:auto'));
    expect(useToastStore.getState().toasts.some((t) => t.message === 'Layout deleted')).toBe(true);
  });

  it('sends nothing when the operator declines the confirm', async () => {
    stubLayouts();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { result } = await mounted();
    act(() => result.current.setLayoutId('saved:12'));
    await act(async () => { result.current.remove(); });
    expect(deleted).toEqual([]);
    expect(result.current.layoutId).toBe('saved:12');
  });

  it('reports a failed delete and keeps the selection', async () => {
    stubLayouts();
    server.use(http.delete('/api/v3/montage_layouts/:id', () =>
      HttpResponse.json({ kind: 'FORBIDDEN', error_message: 'not yours' }, { status: 403 })));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { result } = await mounted();
    act(() => result.current.setLayoutId('saved:12'));

    await act(async () => { result.current.remove(); });
    await waitFor(() =>
      expect(useToastStore.getState().toasts.some((t) => t.tone === 'error')).toBe(true));
    expect(result.current.layoutId).toBe('saved:12');
  });
});

describe('useClassicMontage — stage controls', () => {
  it('Width / Height / Scale drive the per-cell style', async () => {
    stubLayouts();
    const { result } = await mounted();

    // Default: Auto scale, landscape camera fills the column width.
    expect(result.current.stage.size).toEqual({ width: 'auto', height: 'auto', scale: '0' });
    expect(result.current.stage.styleFor(m(1))).toMatchObject({ aspectRatio: '1920 / 1080' });

    act(() => result.current.stage.setWidth('640px'));
    expect(result.current.stage.size.width).toBe('640px');
    expect(result.current.stage.styleFor(m(1))).toMatchObject({ width: '640px' });

    act(() => result.current.stage.setHeight('480px'));
    expect(result.current.stage.styleFor(m(1))).toMatchObject({ width: '640px', height: '480px' });

    act(() => { result.current.stage.setWidth('auto'); result.current.stage.setHeight('auto'); });
    act(() => result.current.stage.setScale('100'));
    expect(result.current.stage.size.scale).toBe('100');
    expect(result.current.stage.styleFor(m(1))).toMatchObject({ width: '1920px' });
  });

  it('exposes the persisted status position and protocol', async () => {
    stubLayouts();
    const { result } = await mounted();
    expect(result.current.statusPosition).toBe('inside');
    act(() => result.current.setStatusPosition('hidden'));
    expect(result.current.statusPosition).toBe('hidden');
    act(() => result.current.setProtocol('hls'));
    expect(result.current.protocol).toBe('hls');
  });
});

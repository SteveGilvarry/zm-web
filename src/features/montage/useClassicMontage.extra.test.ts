/**
 * useClassicMontage — the halves the first suite left untested: Save /
 * Delete layout (their prompts and the requests they send), the reorder
 * guards, the Width / Height / Scale stage controls, and the error paths.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import type { Monitor } from '@/types';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/components/common/toastStore';
import { useMontageStore } from '@/stores/montage';
import { DEFAULT_STAGE_SIZE } from '@/features/monitors/watchStage';
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
let patched: Array<{ id: string; body: unknown }> = [];
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
// The montage store is global and persisted, so every selection a test makes
// would otherwise leak into the next one.
beforeEach(() => {
  useMontageStore.setState({
    statusPosition: 'inside',
    protocol: 'webrtc',
    classicLayoutId: 'preset:auto',
    montageStage: { ...DEFAULT_STAGE_SIZE },
  });
});
afterEach(() => {
  server.resetHandlers();
  posted = []; patched = []; deleted = [];
  useToastStore.getState().clear();
});
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

function stubLayouts(seed: unknown[] = [
  { id: 12, name: 'Zulu wall', user_id: 1, positions: savedPositions },
  { id: 13, name: 'alpha wall', user_id: 1, positions: savedPositions },
  { id: 14, name: 'Corrupt', user_id: 1, positions: 'not-json' },
]) {
  // A created layout joins the list the refetch sees, as it would on a box.
  const items = [...seed];
  server.use(
    http.get('/api/v3/montage_layouts', () =>
      HttpResponse.json({ items, total: items.length, per_page: 200, current_page: 1, last_page: 1 })),
    http.post('/api/v3/montage_layouts', async ({ request }) => {
      const body = await request.json();
      posted.push({ url: request.url, body });
      const created = { id: 99, name: (body as { name: string }).name, positions: savedPositions, user_id: 7 };
      items.push(created);
      return HttpResponse.json(created);
    }),
    http.patch('/api/v3/montage_layouts/:id', async ({ params, request }) => {
      const body = await request.json();
      patched.push({ id: String(params.id), body });
      const row = items.find((i) => String((i as { id: number }).id) === String(params.id)) as { id: number; name: string; user_id: number };
      return HttpResponse.json({ ...row, ...(body as object) });
    }),
    http.get('/api/v3/me', () => new HttpResponse(null, { status: 404 })),
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
  it('POSTs the current arrangement + status position under the typed name', async () => {
    stubLayouts();
    useMontageStore.setState({ statusPosition: 'outside' });
    const { result } = await mounted();

    act(() => result.current.reorder(3, 1)); // 3, 1, 2
    act(() => result.current.setSaveName('  Front wall  '));
    await act(async () => { result.current.save(); });
    await waitFor(() => expect(posted).toHaveLength(1));

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

  it('an empty Name PATCHes the selected layout in place (legacy actions/montage.php)', async () => {
    stubLayouts([{ id: 30, name: 'Mine', user_id: 7, positions: savedPositions }, { id: 12, name: 'Zulu wall', user_id: 1, positions: savedPositions }]);
    const { result } = await mounted();
    act(() => result.current.setLayoutId('saved:30'));
    act(() => result.current.beginEdit());
    // The field opens empty, and this user's own layout raises no notice.
    expect(result.current.saveName).toBe('');
    expect(result.current.saveError).toBeNull();

    // The saved order is 3, 1 then 2; swapping 3 and 1 gives 1, 3, 2.
    act(() => result.current.reorder(3, 1));
    await act(async () => { result.current.save(); });
    await waitFor(() => expect(patched).toHaveLength(1));
    expect(posted).toEqual([]);
    expect(patched[0].id).toBe('30');
    const body = patched[0].body as { name?: string; positions: string };
    expect(body.name).toBeUndefined();
    expect(parsePositions(body.positions)?.items.map((i) => i.id)).toEqual(['1', '3', '2']);
    await waitFor(() => expect(result.current.editMode).toBe(false));
    expect(result.current.layoutId).toBe('saved:30');
  });

  it('a typed Name always creates a new row, even with a saved layout selected', async () => {
    stubLayouts([{ id: 30, name: 'Mine', user_id: 7, positions: savedPositions }, { id: 12, name: 'Zulu wall', user_id: 1, positions: savedPositions }]);
    const { result } = await mounted();
    act(() => result.current.setLayoutId('saved:30'));
    act(() => result.current.beginEdit());
    act(() => result.current.setSaveName('Copy of mine'));
    await act(async () => { result.current.save(); });
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(patched).toEqual([]);
    expect((posted[0].body as { name: string }).name).toBe('Copy of mine');
    await waitFor(() => expect(result.current.layoutId).toBe('saved:99'));
  });

  it('refuses an empty-Name save over someone else\'s layout without System Edit', async () => {
    stubLayouts();
    useAuthStore.setState({ user: { iat: 0, exp: 0, user: 'op', uid: 7, perms: { system: 'View', stream: 'View' } } as never });
    try {
      const { result } = await mounted();
      act(() => result.current.setLayoutId('saved:12'));
      act(() => result.current.beginEdit());
      expect(result.current.saveError).toMatch(/may not edit this layout/);
      await act(async () => { result.current.save(); });
      expect(result.current.saveError).toMatch(/someone else's layouts/);
      expect(patched).toEqual([]);
      expect(posted).toEqual([]);
    } finally {
      useAuthStore.setState({ user: { iat: 0, exp: 0, user: 'admin', uid: 7 } as never });
    }
  });

  it('lets a System editor overwrite someone else\'s layout', async () => {
    stubLayouts();
    const { result } = await mounted();
    act(() => result.current.setLayoutId('saved:12'));
    act(() => result.current.beginEdit());
    // Legacy alerts on edit regardless of permission…
    expect(result.current.saveError).toMatch(/may not edit this layout/);
    await act(async () => { result.current.save(); });
    // …but its server lets canEdit('System') save over it.
    await waitFor(() => expect(patched.map((p) => p.id)).toEqual(['12']));
  });

  it('refuses a name that collides with a built-in layout', async () => {
    stubLayouts();
    const { result } = await mounted();
    act(() => result.current.setSaveName('4 Wide'));
    await act(async () => { result.current.save(); });
    expect(posted).toHaveLength(0);
    expect(result.current.saveError).toMatch(/built in layouts/i);
  });

  it('refuses an empty name over a preset', async () => {
    stubLayouts();
    const { result } = await mounted();
    await act(async () => { result.current.save(); });
    expect(posted).toHaveLength(0);
    expect(patched).toHaveLength(0);
    expect(result.current.saveError).toMatch(/cannot edit the built in layouts/i);
  });

  it('reports a failed save through the toast rail', async () => {
    stubLayouts();
    server.use(http.post('/api/v3/montage_layouts', () =>
      HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'duplicate name' }, { status: 500 })));
    const { result } = await mounted();

    act(() => result.current.setSaveName('Front wall'));
    await act(async () => { result.current.save(); });
    await waitFor(() =>
      expect(useToastStore.getState().toasts.some((t) => t.tone === 'error')).toBe(true));
    expect(result.current.layoutId).toBe('preset:auto');
  });
});

describe('useClassicMontage — delete layout', () => {
  it('does nothing on a preset', async () => {
    stubLayouts();
    const { result } = await mounted();
    await act(async () => { result.current.remove(); });
    expect(result.current.deleteConfirmOpen).toBe(false);
    expect(deleted).toEqual([]);
  });

  it('confirms, DELETEs the row and falls back to the Auto preset', async () => {
    stubLayouts();
    const { result } = await mounted();
    act(() => result.current.setLayoutId('saved:12'));

    act(() => result.current.remove());
    expect(result.current.deleteConfirmOpen).toBe(true);
    expect(deleted).toEqual([]);
    await act(async () => { result.current.confirmDelete(); });
    await waitFor(() => expect(deleted).toEqual(['12']));
    await waitFor(() => expect(result.current.layoutId).toBe('preset:auto'));
    expect(result.current.deleteConfirmOpen).toBe(false);
    expect(useToastStore.getState().toasts.some((t) => t.message === 'Layout deleted')).toBe(true);
  });

  it('sends nothing when the operator cancels the confirm', async () => {
    stubLayouts();
    const { result } = await mounted();
    act(() => result.current.setLayoutId('saved:12'));
    act(() => result.current.remove());
    act(() => result.current.cancelDelete());
    expect(result.current.deleteConfirmOpen).toBe(false);
    expect(deleted).toEqual([]);
    expect(result.current.layoutId).toBe('saved:12');
  });

  it('answers a user without System Edit with the no-permission modal', async () => {
    stubLayouts();
    useAuthStore.setState({ user: { iat: 0, exp: 0, user: 'op', uid: 7, perms: { system: 'View', stream: 'View' } } as never });
    try {
      const { result } = await mounted();
      act(() => result.current.setLayoutId('saved:12'));
      act(() => result.current.remove());
      expect(result.current.noPermOpen).toBe(true);
      expect(result.current.deleteConfirmOpen).toBe(false);
      act(() => result.current.closeNoPerm());
      expect(result.current.noPermOpen).toBe(false);
      expect(deleted).toEqual([]);
    } finally {
      useAuthStore.setState({ user: { iat: 0, exp: 0, user: 'admin', uid: 7 } as never });
    }
  });

  it('reports a failed delete and keeps the selection', async () => {
    stubLayouts();
    server.use(http.delete('/api/v3/montage_layouts/:id', () =>
      HttpResponse.json({ kind: 'FORBIDDEN', error_message: 'not yours' }, { status: 403 })));
    const { result } = await mounted();
    act(() => result.current.setLayoutId('saved:12'));

    act(() => result.current.remove());
    await act(async () => { result.current.confirmDelete(); });
    await waitFor(() =>
      expect(useToastStore.getState().toasts.some((t) => t.tone === 'error')).toBe(true));
    expect(result.current.layoutId).toBe('saved:12');
  });
});

describe('useClassicMontage — stage controls', () => {
  it('Width / Height / Scale drive the per-cell style', async () => {
    stubLayouts();
    const { result } = await mounted();

    // Default: Auto scale, landscape camera fills the column width. The
    // Ratio select shapes the tile — `auto` is the preset nearest the mean
    // of what is on screen, which for 16:9 cameras is 16:9.
    expect(result.current.stage.size).toEqual({ width: 'auto', height: 'auto', scale: '0' });
    expect(result.current.stage.styleFor(m(1))).toMatchObject({ aspectRatio: `${16 / 9} / 1` });

    // `real` gives the camera its own shape back.
    act(() => result.current.setRatio('real'));
    expect(result.current.stage.styleFor(m(1))).toMatchObject({ aspectRatio: '1920 / 1080' });
    act(() => result.current.setRatio('auto'));

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

/**
 * Edit Layout on legacy's 48-column canvas: tiles are resizable, a saved
 * layout comes back the size it was saved, and Save writes the geometry in
 * the shape `objGridStack.save(false, false)` produces.
 */
describe('useClassicMontage — tile geometry', () => {
  /** A hand-made legacy row: one wide tile over two narrow ones. */
  const MIXED = JSON.stringify({
    gridStack: [
      { id: '2', x: 0, y: 0, w: 48, h: 550 },
      { id: '1', x: 0, y: 550, w: 30, h: 300 },
      { id: '3', x: 30, y: 550, w: 18, h: 300 },
    ],
    monitorStatusPosition: 'outsideImgBottom',
    monitorRatio: { 1: 'auto', 2: 'auto', 3: 'auto' },
  });

  /** `mounted()` waits for the default stub's rows; this one waits for ours. */
  async function mountedWith(list: Monitor[]) {
    const hook = renderHook(() => useClassicMontage(list), { wrapper: wrapper() });
    await waitFor(() => expect(hook.result.current.layoutOptions.some((o) => o.value === 'saved:20')).toBe(true));
    return hook;
  }

  it('a preset lays out on the plain column grid until Edit Layout starts', async () => {
    stubLayouts();
    const { result } = await mounted();
    expect(result.current.items).toBeNull();
    act(() => result.current.beginEdit());
    expect(result.current.items?.map((i) => [i.id, i.x, i.w]))
      .toEqual([['1', 0, 16], ['2', 16, 16], ['3', 32, 16]]);
  });

  it('reproduces a legacy layout\'s mixed tile sizes instead of an even grid', async () => {
    stubLayouts([{ id: 20, name: 'Mixed', user_id: 7, positions: MIXED }]);
    const { result } = await mountedWith(monitors);
    act(() => result.current.setLayoutId('saved:20'));
    expect(result.current.monitors.map((x) => x.id)).toEqual([2, 1, 3]);
    expect(result.current.items?.map((i) => [i.id, i.x, i.y, i.w, i.h])).toEqual([
      ['2', 0, 0, 48, 550],
      ['1', 0, 550, 30, 300],
      ['3', 30, 550, 18, 300],
    ]);
  });

  it('packs a camera the saved layout never named onto a row of its own', async () => {
    stubLayouts([{ id: 20, name: 'Mixed', user_id: 7, positions: MIXED }]);
    const { result } = await mountedWith([...monitors, m(8)]);
    act(() => result.current.setLayoutId('saved:20'));
    const tail = result.current.items!.at(-1)!;
    expect(tail.id).toBe('8');
    expect(tail.y).toBeGreaterThanOrEqual(850);
  });

  it('resizes a tile in grid columns and pushes the row along', async () => {
    stubLayouts();
    const { result } = await mounted();
    act(() => result.current.beginEdit());
    act(() => result.current.resizeTile(1, 36));
    expect(result.current.items?.map((i) => [i.id, i.x, i.w]))
      .toEqual([['1', 0, 36], ['2', 0, 16], ['3', 16, 16]]);
    // A monitor the wall does not hold changes nothing.
    act(() => result.current.resizeTile(404, 12));
    expect(result.current.items?.[0].w).toBe(36);
    act(() => result.current.cancelEdit());
    expect(result.current.items).toBeNull();
  });

  it('saves the resized geometry as legacy\'s gridStack', async () => {
    stubLayouts();
    useMontageStore.setState({ statusPosition: 'outside' });
    const { result } = await mounted();

    act(() => result.current.beginEdit());
    act(() => result.current.resizeTile(1, 24));
    act(() => result.current.setSaveName('Wide left'));
    await act(async () => { result.current.save(); });
    await waitFor(() => expect(posted).toHaveLength(1));

    const positions = JSON.parse((posted[0].body as { positions: string }).positions);
    expect(positions.gridStack).toEqual([
      { id: '1', x: 0, y: 0, w: 24, h: 100 },
      { id: '2', x: 24, y: 0, w: 16, h: 100 },
      { id: '3', x: 0, y: 100, w: 16, h: 100 },
    ]);
    expect(positions.monitorStatusPosition).toBe('outsideImgBottom');
    expect(positions.monitorRatio).toEqual({ 1: 'auto', 2: 'auto', 3: 'auto' });
    // And the row reads back as the same wall.
    expect(parsePositions((posted[0].body as { positions: string }).positions)?.items)
      .toEqual(positions.gridStack);
  });
});

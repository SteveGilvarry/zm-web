/**
 * Settings → Options: the system overview, daemon control, the confirm-gated
 * system actions and the inline ZoneMinder config editor (including legacy's
 * "save the whole tab at once" behaviour).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createElement, type ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/components/common/toastStore';
import type { ZmConfig } from '@/types';

let mockSearch: Record<string, unknown> = {};
const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useSearch: () => mockSearch,
  useNavigate: () => mockNavigate,
}));

const { useSettingsOptionsPage, CONFIG_PAGE_SIZE, formatBytes } =
  await import('./useSettingsOptionsPage');

/* ----- fixtures --------------------------------------------------------- */

const cfg = (over: Partial<ZmConfig> & { name: string; category: string }): ZmConfig => ({
  id: 1, value: '', type: 'string', readonly: 0, private: 0, system: 1, ...over,
});

const CONFIGS: ZmConfig[] = [
  cfg({ id: 1, name: 'ZM_PATH_ZMS', category: 'system', value: '/zm/cgi-bin/nph-zms', default_value: '/cgi-bin/nph-zms' }),
  cfg({ id: 2, name: 'ZM_OPT_USE_AUTH', category: 'system', value: '1', type: 'boolean', default_value: 'yes' }),
  cfg({ id: 3, name: 'ZM_WEB_EVENTS_PER_PAGE', category: 'web', value: '25', type: 'integer', pattern: '(?^:^\\d+$)' }),
  cfg({ id: 4, name: 'ZM_WEB_TITLE', category: 'web', value: 'ZoneMinder' }),
  cfg({ id: 5, name: 'ZM_X10_DEVICE', category: 'x10', value: '/dev/ttyS0' }),
  cfg({ id: 6, name: 'ZM_DYN_LAST_VERSION', category: 'dynamic', value: '1.36.0' }),
  cfg({ id: 7, name: 'ZM_WEB_H_REFRESH', category: 'highband', value: '60' }),
  cfg({ id: 8, name: 'ZM_NO_DEFAULT', category: 'web', value: 'x', default_value: null }),
];

const paged = (items: unknown[]) =>
  HttpResponse.json({ items, total: items.length, per_page: 500, current_page: 1, last_page: 1 });

/** Every mutating call the hook can make, in order. */
let calls: Array<{ method: string; path: string; body?: unknown }> = [];
const note = async (method: string, path: string, request?: Request) => {
  calls.push({ method, path, body: request ? await request.json().catch(() => undefined) : undefined });
};

function stub(opts: { x10?: '0' | '1'; configs?: ZmConfig[] } = {}) {
  server.use(
    http.get('/api/v3/system/status', () =>
      HttpResponse.json({
        running: true,
        daemons: [],
        stats: {
          cpu_load: 1.2, cpu_usage_percent: 15, total_mem: 1000, free_mem: 250,
          total_swap: 0, free_swap: 0, total_disk: 1e12, used_disk: 5e11,
          free_disk: 5e11, disk_usage_percent: 50,
        },
      })),
    http.get('/api/v3/host/getVersion', () =>
      HttpResponse.json({ version: '1.36.33', api_version: '3.0.0', db_version: '1.36.33' })),
    http.get('/api/v3/daemons', () =>
      HttpResponse.json({ daemons: [{ id: 'zmc', name: 'zmc', state: 'running', pid: 42, uptime_seconds: 90 }] })),
    // Two callers, one endpoint: the page lists the rows it renders, and
    // `useZmConfig` reads the whole table in one request (`page_size=1000`)
    // rather than one per setting. Only the latter carries the gate row —
    // putting it in the page's list would change the category counts.
    http.get('/api/v3/configs', ({ request }) => {
      const rows = opts.configs ?? CONFIGS;
      const wholeTable = new URL(request.url).searchParams.get('page_size') === '1000';
      return paged(
        wholeTable
          ? [...rows, cfg({ name: 'ZM_OPT_X10', value: opts.x10 ?? '0', category: 'x10' })]
          : rows,
      );
    }),
    http.put('/api/v3/configs/:name', async ({ params, request }) => {
      await note('PUT', `/configs/${params.name}`, request);
      return HttpResponse.json({ ...cfg({ name: String(params.name), category: 'web' }) });
    }),
    http.post('/api/v3/system/:action', async ({ params }) => {
      await note('POST', `/system/${params.action}`);
      return new HttpResponse(null, { status: 204 });
    }),
    http.post('/api/v3/daemons/:name/:action', async ({ params }) => {
      await note('POST', `/daemons/${params.name}/${params.action}`);
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({ accessToken: 't', refreshToken: 't', user: null, isAuthenticated: true });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  server.resetHandlers();
  calls = [];
  mockSearch = {};
  mockNavigate.mockReset();
  useToastStore.getState().clear();
});
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

function wrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

async function mount() {
  const view = renderHook(() => useSettingsOptionsPage(), { wrapper: wrapper() });
  await waitFor(() => expect(view.result.current.allConfigs.length).toBeGreaterThan(0));
  return view;
}

/* ----- tests ------------------------------------------------------------ */

describe('formatBytes', () => {
  it('scales through the units and floors at "0 B"', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512.0 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 ** 3)).toBe('5.0 GB');
    expect(formatBytes(3 * 1024 ** 4)).toBe('3.0 TB');
  });
});

describe('useSettingsOptionsPage — overview', () => {
  it('exposes system status, version, daemons and derived memory use', async () => {
    stub();
    const { result } = await mount();
    await waitFor(() => expect(result.current.versionData?.version).toBe('1.36.33'));

    expect(result.current.systemStatus?.running).toBe(true);
    expect(result.current.stats?.disk_usage_percent).toBe(50);
    expect(result.current.daemons.map((d) => d.name)).toEqual(['zmc']);
    // (1000 - 250) / 1000
    expect(result.current.memoryUsedPercent).toBe(75);
  });

  it('reports 0% memory use when the backend serves no stats', async () => {
    stub();
    server.use(http.get('/api/v3/system/status', () => HttpResponse.json({ running: false, daemons: [] })));
    const { result } = await mount();
    await waitFor(() => expect(result.current.systemStatus?.running).toBe(false));
    expect(result.current.stats).toBeUndefined();
    expect(result.current.memoryUsedPercent).toBe(0);
  });
});

describe('useSettingsOptionsPage — categories and the rail', () => {
  it('counts only the categories an operator may browse', async () => {
    stub();
    const { result } = await mount();
    expect(result.current.categoryList).toEqual([
      { name: 'system', count: 2 },
      { name: 'web', count: 3 },
    ]);
    // Hidden, dynamic and bandwidth rows never reach the rail...
    expect(result.current.categoryList.map((c) => c.name)).not.toContain('dynamic');
    expect(result.current.categoryList.map((c) => c.name)).not.toContain('highband');
    // ...nor the "All" listing.
    expect(result.current.filteredConfigs.map((c) => c.name)).not.toContain('ZM_DYN_LAST_VERSION');
    expect(result.current.filteredConfigs).toHaveLength(5);
  });

  it('adds the X10 category once ZM_OPT_X10 is on', async () => {
    stub({ x10: '1' });
    const { result } = await mount();
    await waitFor(() => expect(result.current.categoryList.map((c) => c.name)).toContain('x10'));
    expect(result.current.tabs.map((t) => t.key)).toContain('x10');
    expect(result.current.filteredConfigs.map((c) => c.name)).toContain('ZM_X10_DEVICE');
  });
});

describe('useSettingsOptionsPage — category selection via ?category=', () => {
  it('filters to the requested category', async () => {
    mockSearch = { category: 'web' };
    stub();
    const { result } = await mount();
    expect(result.current.selectedCategory).toBe('web');
    expect(result.current.filteredConfigs.map((c) => c.category)).toEqual(['web', 'web', 'web']);
  });

  it('reads an unknown or hidden category as "All" without rewriting the URL', async () => {
    mockSearch = { category: 'dynamic' };
    stub();
    const { result } = await mount();
    expect(result.current.selectedCategory).toBeNull();
    expect(result.current.filteredConfigs).toHaveLength(5);

    mockSearch = { category: 42 };
    const second = await mount();
    expect(second.result.current.selectedCategory).toBeNull();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('lists nothing for the Display pseudo-tab', async () => {
    mockSearch = { category: 'display' };
    stub();
    const { result } = await mount();
    expect(result.current.selectedCategory).toBe('display');
    expect(result.current.filteredConfigs).toEqual([]);
  });

  it('selectCategory writes ?category= and clears it again', async () => {
    stub();
    const { result } = await mount();

    act(() => result.current.selectCategory('web'));
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ to: '/settings', replace: true }),
    );
    const setter = mockNavigate.mock.calls[0][0].search as (p: Record<string, unknown>) => unknown;
    expect(setter({ page: 2 })).toEqual({ page: 2, category: 'web' });

    act(() => result.current.selectCategory(null));
    const clear = mockNavigate.mock.calls[1][0].search as (p: Record<string, unknown>) => unknown;
    expect(clear({ page: 2, category: 'web' })).toEqual({ page: 2 });
  });

  it('selectCategory resets the search box and the page', async () => {
    stub();
    const { result } = await mount();
    act(() => result.current.setConfigSearch('TITLE'));
    await waitFor(() => expect(result.current.configSearch).toBe('TITLE'));

    act(() => result.current.selectCategory('web'));
    await waitFor(() => expect(result.current.configSearch).toBe(''));
    expect(result.current.configPage).toBe(1);
  });
});

describe('useSettingsOptionsPage — search and paging', () => {
  it('filters by a case-insensitive name substring', async () => {
    stub();
    const { result } = await mount();
    act(() => result.current.setConfigSearch('web_title'));
    await waitFor(() => expect(result.current.filteredConfigs).toHaveLength(1));
    expect(result.current.filteredConfigs[0].name).toBe('ZM_WEB_TITLE');

    act(() => result.current.setConfigSearch('no-such-config'));
    await waitFor(() => expect(result.current.filteredConfigs).toEqual([]));
    expect(result.current.configTotalPages).toBe(1);
  });

  it('pages the filtered list and clamps at both ends', async () => {
    const many = Array.from({ length: CONFIG_PAGE_SIZE + 5 }, (_, i) =>
      cfg({ id: 100 + i, name: `ZM_BULK_${i}`, category: 'web' }));
    stub({ configs: many });
    const { result } = await mount();
    await waitFor(() => expect(result.current.filteredConfigs).toHaveLength(CONFIG_PAGE_SIZE + 5));

    expect(result.current.configTotalPages).toBe(2);
    expect(result.current.paginatedConfigs).toHaveLength(CONFIG_PAGE_SIZE);
    expect(result.current.paginatedConfigs[0].name).toBe('ZM_BULK_0');

    act(() => result.current.prevConfigPage());
    expect(result.current.configPage).toBe(1);  // already at the first page

    act(() => result.current.nextConfigPage());
    await waitFor(() => expect(result.current.configPage).toBe(2));
    expect(result.current.paginatedConfigs).toHaveLength(5);

    act(() => result.current.nextConfigPage());
    expect(result.current.configPage).toBe(2);  // clamped at the last page

    act(() => result.current.prevConfigPage());
    await waitFor(() => expect(result.current.configPage).toBe(1));
  });
});

describe('useSettingsOptionsPage — system and daemon actions', () => {
  it('POSTs the matching endpoint for each system action', async () => {
    stub();
    const { result } = await mount();
    for (const action of ['startup', 'shutdown', 'restart', 'logrotate'] as const) {
      act(() => result.current.runSystemAction(action));
      await waitFor(() => expect(calls.some((c) => c.path.endsWith(action === 'logrotate' ? 'logrot' : action))).toBe(true));
    }
    expect(calls.map((c) => c.path)).toEqual([
      '/system/startup', '/system/shutdown', '/system/restart', '/system/logrot',
    ]);
    expect(calls.every((c) => c.method === 'POST')).toBe(true);
  });

  it('clears the confirm dialog once the action lands', async () => {
    stub();
    const { result } = await mount();
    act(() => result.current.setConfirmAction({ action: 'shutdown', title: 'Stop', message: 'Sure?' }));
    expect(result.current.confirmAction?.action).toBe('shutdown');

    act(() => result.current.runSystemAction('shutdown'));
    await waitFor(() => expect(result.current.confirmAction).toBeNull());
  });

  it('toasts and keeps the dialog open when a system action fails', async () => {
    stub();
    server.use(http.post('/api/v3/system/shutdown', () =>
      HttpResponse.json({ kind: 'INTERNAL', error_message: 'zmpkg failed' }, { status: 500 })));
    const { result } = await mount();
    act(() => result.current.setConfirmAction({ action: 'shutdown', title: 'Stop', message: 'Sure?' }));

    act(() => result.current.runSystemAction('shutdown'));
    await waitFor(() => expect(useToastStore.getState().toasts).toHaveLength(1));
    expect(useToastStore.getState().toasts[0].tone).toBe('error');
    expect(result.current.confirmAction).not.toBeNull();
  });

  it('POSTs start / stop / restart for a named daemon', async () => {
    stub();
    const { result } = await mount();
    for (const action of ['start', 'stop', 'restart'] as const) {
      act(() => result.current.runDaemonAction({ name: 'zmc', action }));
      await waitFor(() => expect(calls.some((c) => c.path === `/daemons/zmc/${action}`)).toBe(true));
    }
    expect(calls.map((c) => c.path)).toEqual([
      '/daemons/zmc/start', '/daemons/zmc/stop', '/daemons/zmc/restart',
    ]);
  });

  it('toasts when a daemon action is unreachable', async () => {
    stub();
    server.use(http.post('/api/v3/daemons/:name/:action', () => HttpResponse.error()));
    const { result } = await mount();
    act(() => result.current.runDaemonAction({ name: 'zmc', action: 'restart' }));
    await waitFor(() => expect(useToastStore.getState().toasts).toHaveLength(1));
    expect(useToastStore.getState().toasts[0].tone).toBe('error');
  });
});

describe('useSettingsOptionsPage — inline config edit', () => {
  it('PUTs the edited value as a string and closes the editor', async () => {
    stub();
    const { result } = await mount();
    act(() => result.current.startEdit('ZM_WEB_TITLE', 'ZoneMinder'));
    expect(result.current.editingConfig).toBe('ZM_WEB_TITLE');
    expect(result.current.editValue).toBe('ZoneMinder');

    act(() => result.current.setEditValue('Mission Control'));
    act(() => result.current.saveEdit('ZM_WEB_TITLE'));
    await waitFor(() => expect(result.current.editingConfig).toBeNull());

    expect(calls).toEqual([
      { method: 'PUT', path: '/configs/ZM_WEB_TITLE', body: { value: 'Mission Control' } },
    ]);
  });

  it('refuses to save a value that fails the row pattern', async () => {
    stub();
    const { result } = await mount();
    act(() => result.current.startEdit('ZM_WEB_EVENTS_PER_PAGE', '25'));
    act(() => result.current.setEditValue('twenty'));
    await waitFor(() => expect(result.current.editError).toMatch(/does not match/i));

    act(() => result.current.saveEdit('ZM_WEB_EVENTS_PER_PAGE'));
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toEqual([]);
    expect(result.current.editingConfig).toBe('ZM_WEB_EVENTS_PER_PAGE');

    act(() => result.current.setEditValue('50'));
    await waitFor(() => expect(result.current.editError).toBeNull());
  });

  it('surfaces a failed save as a toast and an error message', async () => {
    stub();
    server.use(http.put('/api/v3/configs/:name', () =>
      HttpResponse.json({ kind: 'VALIDATION', error_message: 'read-only row' }, { status: 400 })));
    const { result } = await mount();
    act(() => result.current.startEdit('ZM_WEB_TITLE', 'ZoneMinder'));
    act(() => result.current.setEditValue('nope'));
    act(() => result.current.saveEdit('ZM_WEB_TITLE'));

    await waitFor(() => expect(useToastStore.getState().toasts).toHaveLength(1));
    expect(result.current.configSaveError).toBeTruthy();
    expect(result.current.editingConfig).toBe('ZM_WEB_TITLE');
  });

  it('writes the boolean default as 1/0 and ignores rows with no default', async () => {
    stub();
    const { result } = await mount();
    const boolRow = result.current.allConfigs.find((c) => c.name === 'ZM_OPT_USE_AUTH')!;
    act(() => result.current.resetToDefault(boolRow));
    await waitFor(() => expect(calls).toHaveLength(1));
    // `default_value: 'yes'` must be stored as the 1/0 the DB actually holds.
    expect(calls[0]).toEqual({ method: 'PUT', path: '/configs/ZM_OPT_USE_AUTH', body: { value: '1' } });

    const noDefault = result.current.allConfigs.find((c) => c.name === 'ZM_NO_DEFAULT')!;
    act(() => result.current.resetToDefault(noDefault));
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toHaveLength(1);
  });

  it('writes a string default verbatim', async () => {
    stub();
    const { result } = await mount();
    const row = result.current.allConfigs.find((c) => c.name === 'ZM_PATH_ZMS')!;
    act(() => result.current.resetToDefault(row));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toEqual({ value: '/cgi-bin/nph-zms' });
  });
});

describe('useSettingsOptionsPage — dirty rows and Save all', () => {
  it('parks an uncommitted edit instead of dropping it, and counts it', async () => {
    stub();
    const { result } = await mount();
    act(() => result.current.startEdit('ZM_WEB_TITLE', 'ZoneMinder'));
    act(() => result.current.setEditValue('Mission Control'));
    // The open row already counts as dirty.
    expect(result.current.dirtyCount).toBe(1);

    act(() => result.current.cancelEdit());
    await waitFor(() => expect(result.current.dirty).toEqual({ ZM_WEB_TITLE: 'Mission Control' }));
    expect(result.current.editingConfig).toBeNull();
    expect(result.current.dirtyCount).toBe(1);
    expect(calls).toEqual([]);
  });

  it('drops the dirty entry when the operator types the original value back', async () => {
    stub();
    const { result } = await mount();
    act(() => result.current.startEdit('ZM_WEB_TITLE', 'ZoneMinder'));
    act(() => result.current.setEditValue('Changed'));
    act(() => result.current.cancelEdit());
    await waitFor(() => expect(result.current.dirty.ZM_WEB_TITLE).toBe('Changed'));

    act(() => result.current.startEdit('ZM_WEB_TITLE', 'ZoneMinder'));
    // startEdit re-seeds from the parked value…
    expect(result.current.editValue).toBe('Changed');
    act(() => result.current.setEditValue('ZoneMinder'));
    act(() => result.current.cancelEdit());
    await waitFor(() => expect(result.current.dirty).toEqual({}));
    expect(result.current.dirtyCount).toBe(0);
  });

  it('parks the open row when the operator moves to another one', async () => {
    stub();
    const { result } = await mount();
    act(() => result.current.startEdit('ZM_WEB_TITLE', 'ZoneMinder'));
    act(() => result.current.setEditValue('Mission Control'));
    act(() => result.current.startEdit('ZM_PATH_ZMS', '/zm/cgi-bin/nph-zms'));

    await waitFor(() => expect(result.current.dirty.ZM_WEB_TITLE).toBe('Mission Control'));
    expect(result.current.editingConfig).toBe('ZM_PATH_ZMS');
    expect(result.current.editValue).toBe('/zm/cgi-bin/nph-zms');
  });

  it('saveAll writes every dirty row plus the open editor, then reports the count', async () => {
    stub();
    const { result } = await mount();
    act(() => result.current.startEdit('ZM_WEB_TITLE', 'ZoneMinder'));
    act(() => result.current.setEditValue('Mission Control'));
    act(() => result.current.cancelEdit());
    await waitFor(() => expect(result.current.dirtyCount).toBe(1));

    act(() => result.current.startEdit('ZM_PATH_ZMS', '/zm/cgi-bin/nph-zms'));
    act(() => result.current.setEditValue('/usr/lib/zm/cgi-bin/nph-zms'));
    expect(result.current.dirtyCount).toBe(2);

    act(() => result.current.saveAll());
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls).toEqual([
      { method: 'PUT', path: '/configs/ZM_WEB_TITLE', body: { value: 'Mission Control' } },
      { method: 'PUT', path: '/configs/ZM_PATH_ZMS', body: { value: '/usr/lib/zm/cgi-bin/nph-zms' } },
    ]);

    await waitFor(() => expect(useToastStore.getState().toasts).toHaveLength(1));
    expect(useToastStore.getState().toasts[0]).toMatchObject({ tone: 'success', message: '2 settings saved' });
    expect(result.current.editingConfig).toBeNull();
  });

  it('saveAll reports the rows that would not save', async () => {
    stub();
    server.use(http.put('/api/v3/configs/:name', ({ params }) => {
      if (params.name === 'ZM_WEB_TITLE') {
        return HttpResponse.json({ kind: 'VALIDATION', error_message: 'nope' }, { status: 400 });
      }
      return HttpResponse.json({ name: params.name, value: 'x' });
    }));
    const { result } = await mount();
    act(() => result.current.startEdit('ZM_WEB_TITLE', 'ZoneMinder'));
    act(() => result.current.setEditValue('Mission Control'));
    act(() => result.current.cancelEdit());
    act(() => result.current.startEdit('ZM_PATH_ZMS', '/zm/cgi-bin/nph-zms'));
    act(() => result.current.setEditValue('/other'));

    act(() => result.current.saveAll());
    await waitFor(() => expect(useToastStore.getState().toasts).toHaveLength(2));
    const messages = useToastStore.getState().toasts.map((t) => t.message);
    expect(messages).toContain('1 setting saved');
    expect(messages).toContain('Failed to save: ZM_WEB_TITLE');
  });

  it('saveAll is a no-op with nothing dirty', async () => {
    stub();
    const { result } = await mount();
    act(() => result.current.saveAll());
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toEqual([]);
    expect(result.current.isSavingAll).toBe(false);
  });

  it('discardDirty drops one row or the whole set', async () => {
    stub();
    const { result } = await mount();
    act(() => result.current.startEdit('ZM_WEB_TITLE', 'ZoneMinder'));
    act(() => result.current.setEditValue('A'));
    act(() => result.current.cancelEdit());
    act(() => result.current.startEdit('ZM_PATH_ZMS', '/zm/cgi-bin/nph-zms'));
    act(() => result.current.setEditValue('B'));
    act(() => result.current.cancelEdit());
    await waitFor(() => expect(Object.keys(result.current.dirty)).toHaveLength(2));

    act(() => result.current.discardDirty('ZM_WEB_TITLE'));
    await waitFor(() => expect(Object.keys(result.current.dirty)).toEqual(['ZM_PATH_ZMS']));

    act(() => result.current.discardDirty());
    await waitFor(() => expect(result.current.dirty).toEqual({}));
    expect(result.current.dirtyCount).toBe(0);
  });

  it('committing a row clears its parked value', async () => {
    stub();
    const { result } = await mount();
    act(() => result.current.startEdit('ZM_WEB_TITLE', 'ZoneMinder'));
    act(() => result.current.setEditValue('Mission Control'));
    act(() => result.current.cancelEdit());
    await waitFor(() => expect(result.current.dirty.ZM_WEB_TITLE).toBe('Mission Control'));

    act(() => result.current.startEdit('ZM_WEB_TITLE', 'ZoneMinder'));
    act(() => result.current.saveEdit('ZM_WEB_TITLE'));
    await waitFor(() => expect(result.current.dirty).toEqual({}));
    expect(calls[0].body).toEqual({ value: 'Mission Control' });
  });
});

describe('useSettingsOptionsPage — config load failures', () => {
  it('flags isError on a 500 and can be retried', async () => {
    stub();
    let hits = 0;
    server.use(http.get('/api/v3/configs', () => {
      hits += 1;
      return HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'config table locked' }, { status: 500 });
    }));
    const { result } = renderHook(() => useSettingsOptionsPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.configsIsError).toBe(true));

    expect(result.current.configsError).toBeTruthy();
    expect(result.current.allConfigs).toEqual([]);
    expect(result.current.categoryList).toEqual([]);
    // The rail still offers the page tabs so the operator is not stranded.
    expect(result.current.tabs.every((tab) => tab.kind === 'page')).toBe(true);

    act(() => result.current.refetchConfigs());
    await waitFor(() => expect(hits).toBeGreaterThan(1));
  });

  it('flags isError when the backend is unreachable', async () => {
    stub();
    server.use(http.get('/api/v3/configs', () => HttpResponse.error()));
    const { result } = renderHook(() => useSettingsOptionsPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.configsIsError).toBe(true));
    expect(result.current.allConfigs).toEqual([]);
  });

  it('asks for nothing while signed out', async () => {
    stub();
    useAuthStore.setState({ isAuthenticated: false });
    try {
      const { result } = renderHook(() => useSettingsOptionsPage(), { wrapper: wrapper() });
      await new Promise((r) => setTimeout(r, 30));
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.allConfigs).toEqual([]);
      expect(result.current.systemStatus).toBeUndefined();
    } finally {
      useAuthStore.setState({ isAuthenticated: true });
    }
  });
});

/**
 * Classic sub-header strip: Load / Cpu / DB / storage / Memory / Swap and
 * the version, each rendered only when the backend supplies it, with the
 * colours and tooltips `getDbConHTML` / `getRamHTML` / `getZMVersionHTML`
 * give them.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import { makeStorageArea } from '@/test/fixtures/storageAreas';
import type { ZmStorage } from '@/types';
import type { ReactNode } from 'react';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: ReactNode; to?: string; [k: string]: unknown }) => (
    <a href={to ?? '#'} {...rest}>{children}</a>
  ),
}));

const { ClassicStatBar } = await import('./StatBar');

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({ accessToken: 't', refreshToken: 't', user: null, isAuthenticated: true });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  server.resetHandlers();
  useUiStore.setState({ classicStatBarOpen: true });
});
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

const FULL_STATS = {
  cpu_load: 1.234,
  cpu_usage_percent: 15.34,
  total_mem: 16_000_000_000,
  free_mem: 4_000_000_000,
  total_swap: 4_000_000_000,
  free_swap: 3_000_000_000,
  total_disk: 1_000_000_000_000,
  used_disk: 500_000_000_000,
  free_disk: 500_000_000_000,
  disk_usage_percent: 49.6,
};

/** The config rows the strip reads: the gate, and the version comparison. */
function configRows(overrides: Record<string, string> = {}) {
  const base: Record<string, string> = {
    ZM_WEB_SHOW_SERVER_STATS: '1',
    ZM_DYN_DB_VERSION: '',
    ZM_DYN_LAST_VERSION: '',
    ZM_CHECK_FOR_UPDATES: '0',
    ZM_DYN_NEXT_REMINDER: '0',
    ...overrides,
  };
  return Object.entries(base).map(([name, value], i) => ({
    id: i + 1, name, value, type: 'string', category: 'web', readonly: 0, private: 0, system: 0,
  }));
}

function stub(
  status: Record<string, unknown>,
  version: Record<string, unknown> = { version: '1.37.64' },
  configs: Record<string, string> = {},
  storage: ZmStorage[] = [makeStorageArea()],
) {
  server.use(
    http.get('/api/v3/storage', () =>
      HttpResponse.json({ items: storage, total: storage.length, per_page: 200, current_page: 1, last_page: 1 })),
    http.get('/api/v3/system/status', () => HttpResponse.json(status)),
    http.get('/api/v3/host/getVersion', () => HttpResponse.json(version)),
    http.get('/api/v3/configs', () =>
      HttpResponse.json({ items: configRows(configs), total: 5, per_page: 1000, current_page: 1, last_page: 1 })),
    http.get('/api/v3/me', () => HttpResponse.json({ id: 1, username: 'admin', system: 'Edit' })),
  );
}

describe('ClassicStatBar', () => {
  it('renders every stat, rounded the way the legacy navbar did', async () => {
    stub({ running: true, daemons: [], stats: FULL_STATS });
    renderWithProviders(<ClassicStatBar />);

    expect(await screen.findByText('Load: 1.23')).toBeInTheDocument();
    expect(screen.getByText('Cpu: 15.3%')).toBeInTheDocument();
    expect(screen.getByText('Default: 50%')).toBeInTheDocument();
    // 12 GB of 16 GB used.
    expect(screen.getByText('Memory: 75%')).toBeInTheDocument();
    expect(screen.getByText('Swap: 25%')).toBeInTheDocument();
  });

  it('shows the backend version prefixed with v', async () => {
    stub({ running: true, daemons: [], stats: FULL_STATS });
    renderWithProviders(<ClassicStatBar />);
    expect(await screen.findByText('v1.37.64')).toBeInTheDocument();
  });

  it('renders an empty strip when the status carries no stats block', async () => {
    stub({ running: true, daemons: [] }, {});
    renderWithProviders(<ClassicStatBar />);

    await waitFor(() => expect(screen.queryByText(/^Load:/)).toBeNull());
    expect(screen.queryByText(/^Cpu:/)).toBeNull();
    expect(screen.queryByText(/^Default:/)).toBeNull();
    expect(screen.queryByText(/^Memory:/)).toBeNull();
    expect(screen.queryByText(/^Swap:/)).toBeNull();
  });

  it('drops the memory and swap chips when the totals are zero', async () => {
    stub({
      running: true,
      daemons: [],
      stats: { ...FULL_STATS, total_mem: 0, free_mem: 0, total_swap: 0, free_swap: 0 },
    });
    renderWithProviders(<ClassicStatBar />);

    expect(await screen.findByText('Load: 1.23')).toBeInTheDocument();
    expect(screen.queryByText(/^Memory:/)).toBeNull();
    expect(screen.queryByText(/^Swap:/)).toBeNull();
  });

  it('prints DB connections out of the pool maximum, warned over 90%', async () => {
    stub({ running: true, daemons: [], stats: { ...FULL_STATS, db_connections: 5, db_max_connections: 25 } });
    renderWithProviders(<ClassicStatBar />);
    const db = await screen.findByTestId('stat-db');
    expect(db).toHaveTextContent('DB: 5/25');
    expect(db.className).toBe('');
  });

  it('warns on the DB chip once the pool is over 90% used', async () => {
    stub({ running: true, daemons: [], stats: { ...FULL_STATS, db_connections: 23, db_max_connections: 25 } });
    renderWithProviders(<ClassicStatBar />);
    expect((await screen.findByTestId('stat-db')).className).toContain('ffa801');
  });

  it('drops the DB chip on a backend that does not report the pool', async () => {
    stub({ running: true, daemons: [], stats: FULL_STATS });
    renderWithProviders(<ClassicStatBar />);
    await screen.findByText('Load: 1.23');
    expect(screen.queryByTestId('stat-db')).toBeNull();
  });

  it('titles memory and swap with used of total, and reddens over 95%', async () => {
    stub({
      running: true, daemons: [],
      stats: { ...FULL_STATS, total_mem: 16_000_000_000, free_mem: 100_000_000 },
    });
    renderWithProviders(<ClassicStatBar />);
    const mem = await screen.findByTestId('stat-memory');
    expect(mem).toHaveAttribute('title', '14.81GB of 14.90GB');
    expect(mem.className).toContain('ff3f34');
    expect(screen.getByTestId('stat-swap')).toHaveAttribute('title', '0.93GB of 3.73GB');
  });

  it('marks the version when a newer release is available', async () => {
    stub({ running: true, daemons: [], stats: FULL_STATS }, { version: '1.37.64' }, {
      ZM_DYN_LAST_VERSION: '1.39.0',
      ZM_CHECK_FOR_UPDATES: '1',
    });
    renderWithProviders(<ClassicStatBar />);
    await waitFor(() =>
      expect(screen.getByTestId('stat-version')).toHaveAttribute('title', 'An update to ZoneMinder is available.'));
    expect(screen.getByTestId('stat-version').className).toContain('ffa801');
  });

  it('offers a System editor the reminder menu and writes the chosen config row', async () => {
    const user = userEvent.setup();
    const puts: Array<{ name: string; value: string }> = [];
    stub({ running: true, daemons: [], stats: FULL_STATS }, { version: '1.37.64' }, {
      ZM_DYN_LAST_VERSION: '1.39.0',
      ZM_CHECK_FOR_UPDATES: '1',
    });
    server.use(http.put('/api/v3/configs/:name', async ({ params, request }) => {
      const body = await request.json() as { value: string };
      puts.push({ name: String(params.name), value: body.value });
      return HttpResponse.json({ name: params.name, value: body.value });
    }));
    renderWithProviders(<ClassicStatBar />);
    await user.click(await screen.findByRole('button', { name: 'v1.37.64' }));
    const menu = screen.getByRole('menu', { name: 'An update to ZoneMinder is available.' });
    expect(within(menu).getAllByRole('menuitem').map((b) => b.textContent)).toEqual([
      'Ignore this version', 'Remind again in 1 hour', 'Remind again in 1 day',
      'Remind again in 1 week', 'Remind again in 1 month', "Don't remind about new versions",
    ]);
    await user.click(within(menu).getByRole('menuitem', { name: 'Ignore this version' }));
    await waitFor(() => expect(puts).toEqual([{ name: 'ZM_DYN_CURR_VERSION', value: '1.39.0' }]));
  });

  it('keeps only the version with ZM_WEB_SHOW_SERVER_STATS off', async () => {
    stub({ running: true, daemons: [], stats: FULL_STATS }, { version: '1.37.64' }, {
      ZM_WEB_SHOW_SERVER_STATS: '0',
    });
    renderWithProviders(<ClassicStatBar />);
    await waitFor(() => expect(screen.getByTestId('stat-version')).toHaveTextContent('v1.37.64'));
    expect(screen.queryByText(/^Load:/)).toBeNull();
    expect(screen.queryByTestId('stat-storage')).toBeNull();
  });

  it('polls at ZM_WEB_H_REFRESH_NAVBAR seconds', async () => {
    stub({ running: true, daemons: [], stats: FULL_STATS }, { version: '1.37.64' }, { ZM_WEB_H_REFRESH_NAVBAR: '1' });
    let calls = 0;
    server.use(http.get('/api/v3/system/status', () => { calls++; return HttpResponse.json({ running: true, daemons: [], stats: FULL_STATS }); }));
    renderWithProviders(<ClassicStatBar />);
    await waitFor(() => expect(calls).toBeGreaterThanOrEqual(2), { timeout: 2500 });
  });

  it('links each storage entry to Options → Storage', async () => {
    stub({ running: true, daemons: [], stats: FULL_STATS });
    renderWithProviders(<ClassicStatBar />);
    expect(await screen.findByText('Default: 50%')).toHaveAttribute('href', '/settings/storage');
  });

  it('lists one entry per enabled area, titled used of total and the events share', async () => {
    const GB = 1024 ** 3;
    stub({ running: true, daemons: [], stats: FULL_STATS }, undefined, {}, [
      makeStorageArea({ id: 1, name: 'Default', disk_space: 60 * GB }, { total: 200 * GB, usedPercent: 79.1 }),
      makeStorageArea({ id: 2, name: 'Old', enabled: 0 }),
      makeStorageArea({ id: 3, name: 'Archive', disk_space: null }, { total: 100 * GB, usedPercent: 96 }),
    ]);
    renderWithProviders(<ClassicStatBar />);
    const def = await screen.findByText('Default: 79%');
    expect(def).toHaveAttribute('title', '158.20GB of 200.00GB 60.00GB used by events');
    expect(def.className).not.toMatch(/ffa801|ff3f34/);
    const archive = screen.getByText('Archive: 96%');
    // No cached event size: legacy would sum the events; we leave that half off.
    expect(archive).toHaveAttribute('title', '96.00GB of 100.00GB');
    expect(archive.className).toContain('ffa801');
    expect(screen.queryByText(/^Old:/)).toBeNull();
  });

  it('drops the events half of the title when events fill all the used space', async () => {
    stub({ running: true, daemons: [], stats: FULL_STATS }, undefined, {}, [
      makeStorageArea({ type: 's3fs', disk_space: 10 * 1024 ** 3 }, { total: 100 * 1024 ** 3 }),
    ]);
    renderWithProviders(<ClassicStatBar />);
    expect(await screen.findByText('Default: 10%')).toHaveAttribute('title', '10.00GB of 100.00GB');
  });

  it('reddens an area over 98% and leaves exactly 95% alone', async () => {
    stub({ running: true, daemons: [], stats: FULL_STATS }, undefined, {}, [
      makeStorageArea({ id: 1, name: 'A' }, { usedPercent: 99 }),
      makeStorageArea({ id: 2, name: 'B' }, { usedPercent: 95 }),
    ]);
    renderWithProviders(<ClassicStatBar />);
    expect((await screen.findByText('A: 99%')).className).toContain('ff3f34');
    expect(screen.getByText('B: 95%').className).not.toMatch(/ffa801|ff3f34/);
  });

  it('folds more than two areas into a Storage dropdown coloured by the fullest', async () => {
    const user = userEvent.setup();
    stub({ running: true, daemons: [], stats: FULL_STATS }, undefined, {}, [
      makeStorageArea({ id: 1, name: 'A' }, { usedPercent: 20 }),
      makeStorageArea({ id: 2, name: 'B' }, { usedPercent: 97 }),
      makeStorageArea({ id: 3, name: 'C' }, { usedPercent: 40 }),
    ]);
    renderWithProviders(<ClassicStatBar />);
    const toggle = await screen.findByRole('button', { name: /Storage/ });
    expect(toggle.className).toContain('ffa801');
    expect(screen.queryByText('A: 20%')).toBeNull();
    await user.click(toggle);
    const menu = screen.getByRole('menu', { name: 'Storage' });
    expect(within(menu).getAllByRole('menuitem').map((a) => a.textContent)).toEqual(['A: 20%', 'B: 97%', 'C: 40%']);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('hides itself when the navbar chevron is flipped down', async () => {
    useUiStore.setState({ classicStatBarOpen: false });
    stub({ running: true, daemons: [], stats: FULL_STATS });
    renderWithProviders(<ClassicStatBar />);
    await waitFor(() => expect(screen.queryByTestId('classic-stat-bar')).toBeNull());
  });

  it('renders nothing but the empty version slot while the request is failing', async () => {
    stub({}, {});
    server.use(
      http.get('/api/v3/system/status', () => HttpResponse.error()),
      http.get('/api/v3/host/getVersion', () => HttpResponse.error()),
    );
    renderWithProviders(<ClassicStatBar />);

    await waitFor(() => expect(screen.queryByText(/^Load:/)).toBeNull());
    expect(screen.queryByText(/^v/)).toBeNull();
  });
});

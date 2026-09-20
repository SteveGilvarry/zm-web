/**
 * Classic sub-header strip: Load / Cpu / DB / storage / Memory / Swap and
 * the version, each rendered only when the backend supplies it, with the
 * colours and tooltips `getDbConHTML` / `getRamHTML` / `getZMVersionHTML`
 * give them.
 */
import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import { ClassicStatBar } from './StatBar';

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
) {
  server.use(
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
    const ver = await screen.findByTestId('stat-version');
    await waitFor(() =>
      expect(ver).toHaveAttribute('title', 'An update to ZoneMinder is available.'));
    expect(ver.className).toContain('ffa801');
  });

  it('renders nothing at all with ZM_WEB_SHOW_SERVER_STATS off', async () => {
    stub({ running: true, daemons: [], stats: FULL_STATS }, { version: '1.37.64' }, {
      ZM_WEB_SHOW_SERVER_STATS: '0',
    });
    const { container } = renderWithProviders(<ClassicStatBar />);
    await waitFor(() => expect(screen.queryByText(/^Load:/)).toBeNull());
    expect(container.querySelector('#classic-stat-bar')).toBeNull();
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

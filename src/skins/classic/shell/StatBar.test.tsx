/**
 * Classic sub-header strip: Load / Cpu / Default storage / Memory / Swap
 * and the version, each rendered only when the backend supplies it.
 */
import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import { ClassicStatBar } from './StatBar';

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({ accessToken: 't', refreshToken: 't', user: null, isAuthenticated: true });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => { server.resetHandlers(); });
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

function stub(
  status: Record<string, unknown>,
  version: Record<string, unknown> = { version: '1.37.64' },
) {
  server.use(
    http.get('/api/v3/system/status', () => HttpResponse.json(status)),
    http.get('/api/v3/host/getVersion', () => HttpResponse.json(version)),
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

  it('renders nothing but the empty version slot while the request is failing', async () => {
    server.use(
      http.get('/api/v3/system/status', () => HttpResponse.error()),
      http.get('/api/v3/host/getVersion', () => HttpResponse.error()),
    );
    renderWithProviders(<ClassicStatBar />);

    await waitFor(() => expect(screen.queryByText(/^Load:/)).toBeNull());
    expect(screen.queryByText(/^v/)).toBeNull();
  });
});

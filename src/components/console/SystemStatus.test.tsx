import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import type { DaemonStatus } from '@/types';

// Stub the Link component used for the "manage →" storage link.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to?: string }) => (
    <a href={to ?? '#'} {...rest}>
      {children}
    </a>
  ),
}));

const { SystemStatus } = await import('./SystemStatus');

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', user: null, isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'warn' });
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

// Default: stub version so the version-query never falls through to the
// network. Individual tests can `server.use` to override.
beforeEach(() => {
  server.use(
    http.get('/api/v3/host/getVersion', () =>
      HttpResponse.json({ version: '1.36.34', api_version: '3', db_version: 'x' }),
    ),
  );
});

describe('SystemStatus — loading', () => {
  it('renders skeleton rows when isLoading=true', () => {
    const { container } = renderWithProviders(<SystemStatus isLoading />);
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
  });
});

describe('SystemStatus — running pill', () => {
  it('shows "Running" with emerald styling when isRunning=true', () => {
    renderWithProviders(<SystemStatus daemons={[]} isRunning={true} />);
    expect(screen.getByText('Running')).toBeInTheDocument();
  });

  it('shows "Stopped" when isRunning=false', () => {
    renderWithProviders(<SystemStatus daemons={[]} isRunning={false} />);
    expect(screen.getByText('Stopped')).toBeInTheDocument();
  });
});

describe('SystemStatus — version', () => {
  it('shows the version returned by /host/getVersion', async () => {
    renderWithProviders(<SystemStatus daemons={[]} isRunning={true} />);
    await waitFor(() => expect(screen.getByText('v1.36.34')).toBeInTheDocument());
  });
});

describe('SystemStatus — daemons', () => {
  it('shows "No daemons reported." when the daemons array is empty', () => {
    renderWithProviders(<SystemStatus daemons={[]} isRunning={true} />);
    expect(screen.getByText(/no daemons reported/i)).toBeInTheDocument();
  });

  it('renders one row per daemon and the running/total count', () => {
    const daemons: DaemonStatus[] = [
      { id: 'zmc-1', name: 'zmc', state: 'running', pid: 1234, uptime_seconds: 60, restart_count: 0 },
      { id: 'zma-1', name: 'zma', state: 'stopped', pid: null, uptime_seconds: 0, restart_count: 0 },
    ];
    renderWithProviders(<SystemStatus daemons={daemons} isRunning={true} />);
    expect(screen.getByText('zmc')).toBeInTheDocument();
    expect(screen.getByText('zma')).toBeInTheDocument();
    // 1 running out of 2 total
    expect(screen.getByText(/1\/2/)).toBeInTheDocument();
    expect(screen.getByText(/1 stopped/i)).toBeInTheDocument();
  });

  it('shows the restart count badge when a daemon has restarts > 0', () => {
    const daemons: DaemonStatus[] = [
      { id: 'zmc-1', name: 'zmc', state: 'running', pid: 1234, uptime_seconds: 60, restart_count: 4 },
    ];
    renderWithProviders(<SystemStatus daemons={daemons} isRunning={true} />);
    expect(screen.getByText('4')).toBeInTheDocument();
  });
});

describe('SystemStatus — storage', () => {
  it('renders the storage section with formatted bytes + percent', () => {
    renderWithProviders(
      <SystemStatus
        daemons={[]}
        isRunning={true}
        stats={{
          cpu_load: 0, cpu_usage_percent: 0,
          total_mem: 0, free_mem: 0,
          total_swap: 0, free_swap: 0,
          // 1.5 GB used out of 10 GB
          total_disk: 10 * 1024 ** 3,
          used_disk: 1.5 * 1024 ** 3,
          free_disk: 8.5 * 1024 ** 3,
          disk_usage_percent: 15,
        }}
      />,
    );
    expect(screen.getByText(/15% used/)).toBeInTheDocument();
    // 1.5 GB / 10 GB in the storage row
    expect(screen.getByText(/1\.5 GB \/ 10\.0 GB/)).toBeInTheDocument();
  });

  it('does not render the storage section when stats is omitted', () => {
    renderWithProviders(<SystemStatus daemons={[]} isRunning={true} />);
    expect(screen.queryByText(/% used/)).toBeNull();
  });
});

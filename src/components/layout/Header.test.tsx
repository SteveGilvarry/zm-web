import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import type { UserClaims } from '@/types';

// Stub the SystemRunningToggle out to a sentinel — it has its own tests and
// renders extra mutations / queries we don't care about here.
vi.mock('@/components/system/SystemRunningToggle', () => ({
  SystemRunningToggle: () => <div data-testid="running-toggle" />,
}));

const { Header } = await import('./Header');

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

const defaultStats = {
  cpu_load: 1.23,
  cpu_usage_percent: 42,
  total_mem: 8 * 1024 ** 3,
  free_mem: 4 * 1024 ** 3,
  total_swap: 0,
  free_swap: 0,
  total_disk: 100 * 1024 ** 3,
  used_disk: 50 * 1024 ** 3,
  free_disk: 50 * 1024 ** 3,
  disk_usage_percent: 50,
};

beforeEach(() => {
  // Default happy-path handlers; tests can override per-case via server.use.
  server.use(
    http.get('/api/v3/system/status', () =>
      HttpResponse.json({ running: true, daemons: [], stats: defaultStats }),
    ),
    http.get('/api/v3/host/getVersion', () =>
      HttpResponse.json({ version: '1.36.34', api_version: '3', db_version: 'x' }),
    ),
    http.get('/api/v3/server/health_check', () =>
      HttpResponse.json({ status: 'ok' }),
    ),
  );
});

describe('Header — title', () => {
  it('renders the title prop in the left-hand h1', () => {
    renderWithProviders(<Header title="Dashboard" />);
    expect(screen.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument();
  });

  it('omits the title heading when no title is given', () => {
    renderWithProviders(<Header />);
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });
});

describe('Header — telemetry', () => {
  it('leaves system readings to the page and keeps the chrome quiet', async () => {
    renderWithProviders(<Header />);
    // The clock proves the header rendered and the stats query had time to
    // land; the readings themselves now live on the console's status line.
    await waitFor(() => expect(screen.getByText(/v1\.36\.34/)).toBeInTheDocument());
    expect(screen.queryByText('LOAD')).toBeNull();
    expect(screen.queryByText('MEM')).toBeNull();
    expect(screen.queryByText('DISK')).toBeNull();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

describe('Header — connection indicator', () => {
  it('says nothing while the backend is reachable', async () => {
    renderWithProviders(<Header />);
    await waitFor(() => expect(screen.getByText(/v1\.36\.34/)).toBeInTheDocument());
    expect(screen.queryByText(/disconnected/i)).toBeNull();
  });

  it('shows "Disconnected" when health_check fails', async () => {
    server.use(
      http.get('/api/v3/server/health_check', () =>
        HttpResponse.json({ error: 'down' }, { status: 503 }),
      ),
    );
    renderWithProviders(<Header />);
    await waitFor(() => expect(screen.getByText(/disconnected/i)).toBeInTheDocument());
  });
});

describe('Header — running toggle', () => {
  it('mounts the SystemRunningToggle in the right cluster when authenticated with System=Edit', () => {
    // The toggle is gated on System≥Edit; seed claims that carry it.
    useAuthStore.setState({
      user: { user: 'admin', perms: { system: 'Edit' } } as unknown as UserClaims,
    });
    renderWithProviders(<Header />);
    expect(screen.getByTestId('running-toggle')).toBeInTheDocument();
  });
});

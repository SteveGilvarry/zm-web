import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';

vi.mock('@/skins/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const { default: ServersPage } = await import('./settings.servers');

const server = setupServer();

beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', user: { iat: 0, exp: 4102444800, user: 'admin', uid: 1 }, isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'warn' });
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

const paged = (items: unknown[], per_page = 200) => ({
  items, total: items.length, per_page, current_page: 1, last_page: 1,
});

function seed({
  servers = [] as unknown[],
  monitors = [] as unknown[],
  stats = [] as unknown[],
} = {}) {
  server.use(
    http.get('/api/v3/servers', () => HttpResponse.json(paged(servers))),
    http.get('/api/v3/monitors', () => HttpResponse.json(paged(monitors, 1000))),
    http.get('/api/v3/server-stats', () => HttpResponse.json(paged(stats))),
  );
}

const STAT = (server_id: number, cpu_load: string, cpu_usage_percent: string) => ({
  id: 1, server_id, time_stamp: '2026-08-19T21:53:09+00:00', cpu_load, cpu_usage_percent,
  total_mem: 16768884736, free_mem: 4192221184,
});

describe('Servers page', () => {
  it('lists servers with host:port, monitor count, load and a NotRunning badge', async () => {
    seed({
      servers: [
        { id: 1, name: 'zm-edge-01', hostname: '10.0.0.5', port: 8080, status: 'Running' },
        { id: 2, name: 'zm-edge-02', hostname: '10.0.0.6', port: null, status: 'NotRunning' },
        { id: 3, name: 'zm-edge-03', hostname: null, port: null, status: '' },
      ],
      monitors: [
        { id: 1, name: 'a', server_id: 1 }, { id: 2, name: 'b', server_id: 1 }, { id: 3, name: 'c', server_id: 2 },
      ],
      stats: [STAT(1, '1.7', '40.2')],
    });
    renderWithProviders(<ServersPage />);
    await waitFor(() => expect(screen.getByText('zm-edge-01')).toBeInTheDocument());
    expect(screen.getByText('10.0.0.5:8080')).toBeInTheDocument();
    expect(screen.getByText('10.0.0.6')).toBeInTheDocument();
    expect(screen.getByText('Not running')).toBeInTheDocument();

    const row1 = screen.getByText('zm-edge-01').closest('tr')!;
    await waitFor(() => expect(within(row1).getByText('40.2%')).toBeInTheDocument());
    expect(within(row1).getByText('2')).toBeInTheDocument();
    expect(within(row1).getByText('1.7')).toBeInTheDocument();
    // Free memory 25% (legacy colours < 10% red; 25% sits in the warn-free zone).
    expect(within(row1).getByText('25%')).toBeInTheDocument();
    const row3 = screen.getByText('zm-edge-03').closest('tr')!;
    expect(within(row3).getByText('Unknown')).toBeInTheDocument();
    expect(within(row3).getAllByText('—')).toHaveLength(4);
  });

  it('shows the single-node hint plus the host sample when no servers exist', async () => {
    seed({ stats: [STAT(0, '2.3', '40.0')] });
    renderWithProviders(<ServersPage />);
    await waitFor(() =>
      expect(screen.getByText(/No servers registered/)).toBeInTheDocument(),
    );
    await waitFor(() => expect(screen.getByText('This host')).toBeInTheDocument());
    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  it('registers a new server via POST and clears the form', async () => {
    seed();
    let body: unknown = null;
    server.use(
      http.post('/api/v3/servers', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: 9, ...(body as object) }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<ServersPage />);
    await waitFor(() => expect(screen.getByText(/No servers registered/)).toBeInTheDocument());

    const nameInput = screen.getByPlaceholderText('e.g. zm-edge-01');
    await user.type(nameInput, 'edge-9');
    await user.type(screen.getByPlaceholderText('port'), '80x80');
    await user.click(screen.getByRole('button', { name: /register/i }));

    await waitFor(() => expect(body).toEqual({
      name: 'edge-9', hostname: null, port: 8080, status: 'Unknown',
    }));
    await waitFor(() => expect(nameInput).toHaveValue(''));
  });

  it('edits an existing server via PATCH', async () => {
    seed({ servers: [{ id: 1, name: 'zm-edge-01', hostname: '10.0.0.5', port: 8080, status: 'Running' }] });
    let patched: { id: string; body: unknown } | null = null;
    server.use(
      http.patch('/api/v3/servers/:id', async ({ request, params }) => {
        patched = { id: params.id as string, body: await request.json() };
        return HttpResponse.json({ id: 1, ...(patched.body as object) });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<ServersPage />);
    await waitFor(() => expect(screen.getByText('zm-edge-01')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /edit zm-edge-01/i }));
    expect(screen.getByText('Edit server — zm-edge-01')).toBeInTheDocument();
    const host = screen.getByLabelText('Host');
    expect(host).toHaveValue('10.0.0.5');
    await user.clear(host);
    await user.type(host, '10.0.0.7');
    await user.selectOptions(screen.getByLabelText('Status'), 'NotRunning');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(patched).toEqual({
      id: '1', body: { name: 'zm-edge-01', hostname: '10.0.0.7', port: 8080, status: 'NotRunning' },
    }));
    await waitFor(() => expect(screen.getByText('New server')).toBeInTheDocument());
  });
});

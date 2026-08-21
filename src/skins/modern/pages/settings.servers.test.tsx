import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { makeServer } from '@/test/fixtures/admin';
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
    // The sampled-at tooltip formats through useDateTimeFormat.
    http.get('/api/v3/system/locale', () => HttpResponse.json({ utc_offset: '+00:00', utc_offset_seconds: 0 })),
  );
}

const STAT = (server_id: number, cpu_load: string, cpu_usage_percent: string) => ({
  id: 1, server_id, time_stamp: '2026-08-19T21:53:09+00:00', cpu_load, cpu_usage_percent,
  total_mem: 16768884736, free_mem: 4192221184,
});

describe('Servers page', () => {
  const FLEET = [
    makeServer({ id: 1, name: 'zm-edge-01', hostname: '10.0.0.5', port: 8080, protocol: 'http' }),
    makeServer({
      id: 2, name: 'zm-edge-02', hostname: '10.0.0.6', port: 443, protocol: 'https',
      status: 'NotRunning', path_to_index: null, path_to_zms: null, path_to_api: null,
      zmstats: 0, zmaudit: 0, zmtrigger: 1, zmeventnotification: 1, state_id: 4,
      latitude: -37.81, longitude: 144.96,
    }),
    makeServer({
      id: 3, name: 'zm-edge-03', hostname: null, port: null, protocol: null, status: '',
      path_to_index: null, path_to_zms: null, path_to_api: null,
    }),
  ];

  it('lists the legacy columns: id, url, the three paths, monitor count, load and status', async () => {
    seed({
      servers: FLEET,
      monitors: [
        { id: 1, name: 'a', server_id: 1 }, { id: 2, name: 'b', server_id: 1 }, { id: 3, name: 'c', server_id: 2 },
      ],
      stats: [STAT(1, '1.7', '40.2')],
    });
    renderWithProviders(<ServersPage />);
    await waitFor(() => expect(screen.getByText('zm-edge-01')).toBeInTheDocument());

    const row1 = screen.getByText('zm-edge-01').closest('tr')!;
    expect(within(row1).getByText('http://10.0.0.5:8080')).toBeInTheDocument();
    expect(within(row1).getByText('/zm/index.php')).toBeInTheDocument();
    expect(within(row1).getByText('/zm/cgi-bin/nph-zms')).toBeInTheDocument();
    expect(within(row1).getByText('/zm/api')).toBeInTheDocument();
    expect(within(row1).getByText('Running')).toBeInTheDocument();
    await waitFor(() => expect(within(row1).getByText('40.2%')).toBeInTheDocument());
    expect(within(row1).getByText('2')).toBeInTheDocument();
    expect(within(row1).getByText('1.7')).toBeInTheDocument();
    // Free memory 25% (legacy colours < 10% red; 25% sits in the warn-free zone).
    expect(within(row1).getByText('25%')).toBeInTheDocument();

    // 443 is the https default, so the Url drops it; the paths are unset here.
    const row2 = screen.getByText('zm-edge-02').closest('tr')!;
    expect(within(row2).getByText('https://10.0.0.6')).toBeInTheDocument();
    expect(within(row2).getByText('Not running')).toBeInTheDocument();

    // No hostname → no url, no paths, no stats: url + 3 paths + 4 load cells.
    const row3 = screen.getByText('zm-edge-03').closest('tr')!;
    expect(within(row3).getByText('Unknown')).toBeInTheDocument();
    expect(within(row3).getAllByText('—')).toHaveLength(8);

    // The read-only caveat is stated once for the page, not per field.
    expect(screen.getAllByText(
      'Only name, hostname, port and status are writable; the API does not accept the rest yet.',
    )).toHaveLength(1);
  });

  it('expands a row to the read-only daemon flags, run state and coordinates', async () => {
    seed({ servers: FLEET });
    const user = userEvent.setup();
    renderWithProviders(<ServersPage />);
    await waitFor(() => expect(screen.getByText('zm-edge-02')).toBeInTheDocument());

    const toggle = screen.getByRole('button', { name: 'Details for zm-edge-02' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const value = (label: string) =>
      screen.getByText(label).closest('div')!.querySelector('dd')!.textContent;
    expect(value('Run stats')).toBe('No');
    expect(value('Run audit')).toBe('No');
    expect(value('Run trigger')).toBe('Yes');
    expect(value('Run event notification')).toBe('Yes');
    expect(value('Protocol')).toBe('https');
    expect(value('Run state')).toBe('4');
    expect(value('Coordinates')).toBe('-37.81, 144.96');

    // One row at a time.
    await user.click(screen.getByRole('button', { name: 'Details for zm-edge-01' }));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Run stats')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Details for zm-edge-01' }));
    expect(screen.queryByText('Run stats')).toBeNull();
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
    seed({ servers: [makeServer({ id: 1, name: 'zm-edge-01', hostname: '10.0.0.5', port: 8080 })] });
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

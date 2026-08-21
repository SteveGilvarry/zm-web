/**
 * Options → Servers (classic skin): the legacy cluster table with its load
 * columns, the register/edit form beneath it, and the delete confirm.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { makeServer } from '@/test/fixtures/admin';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/components/common/toastStore';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: ReactNode; to?: string; search?: unknown }) => {
    delete rest.search; // router-only prop
    return <a href={to ?? '#'} {...rest}>{children}</a>;
  },
  useSearch: () => ({}),
  useNavigate: () => vi.fn(),
}));
vi.mock('@/skins/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const ADMIN = {
  iat: 0,
  exp: 4102444800,
  user: 'admin',
  uid: 1,
  perms: {
    stream: 'Edit', events: 'Edit', control: 'Edit', monitors: 'Edit',
    groups: 'Edit', devices: 'Edit', snapshots: 'Edit', system: 'Edit',
  },
};
const VIEWER = { ...ADMIN, user: 'viewer', uid: 2, perms: { ...ADMIN.perms, system: 'View' } };

function signIn(user: unknown = ADMIN) {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', isAuthenticated: true,
    user: user as never,
  });
}

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  useToastStore.getState().clear();
});
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

function paged<T>(items: T[], over: Record<string, number> = {}) {
  return {
    items, total: items.length, per_page: 200, current_page: 1, last_page: 1, ...over,
  };
}

const SERVERS = [
  makeServer({ id: 3, name: 'edge-01', hostname: '10.0.0.3', port: 8080, protocol: 'http' }),
  makeServer({
    id: 4, name: 'edge-02', hostname: '10.0.0.4', port: null, protocol: null,
    status: 'NotRunning', path_to_index: null, path_to_zms: null, path_to_api: null,
    zmstats: 0, zmaudit: 0, zmtrigger: 1, zmeventnotification: 1, state_id: 2,
    latitude: '-37.81', longitude: '144.96',
  }),
];

const STATS = [
  {
    id: 11, server_id: 3, time_stamp: '2026-08-21T10:00:00Z',
    cpu_load: '6.20', cpu_usage_percent: '84.5',
    total_mem: 1000, free_mem: 50, total_swap: 1000, free_swap: 900,
  },
];

/** Requests captured for shape assertions. */
let sent: Array<{ method: string; path: string; body: unknown }> = [];

function chrome() {
  return [
    http.get('/api/v3/configs/categories', () => HttpResponse.json([{ category: 'system', count: 3 }])),
    http.get('/api/v3/configs/:name', ({ params }) =>
      HttpResponse.json({ id: 0, name: params.name, value: '', type: 'string', category: 'web', readonly: 0 })),
  ];
}

function seed(over: Parameters<typeof server.use> = [] as never) {
  sent = [];
  server.use(
    // Overrides go first: msw resolves in insertion order within one use().
    ...(over as never[]),
    ...chrome(),
    http.get('/api/v3/servers', () => HttpResponse.json(paged(SERVERS))),
    http.get('/api/v3/monitors', () => HttpResponse.json(paged([
      { id: 1, name: 'Front Door', server_id: 3, capturing: 'Always', analysing: 'Always', recording: 'OnMotion', width: 1920, height: 1080, orientation: 'ROTATE_0', type: 'Ffmpeg' },
      { id: 2, name: 'Drive', server_id: 3, capturing: 'None', analysing: 'None', recording: 'None', width: 1920, height: 1080, orientation: 'ROTATE_0', type: 'Ffmpeg' },
    ]))),
    http.get('/api/v3/server-stats', ({ request }) => {
      const q = new URL(request.url).searchParams;
      if (q.get('page_size') === '1') return HttpResponse.json(paged([], { total: 1, per_page: 1, last_page: 1 }));
      return HttpResponse.json(paged(STATS, { total: 1 }));
    }),
    http.post('/api/v3/servers', async ({ request }) => {
      const body = await request.json();
      sent.push({ method: 'POST', path: '/servers', body });
      return HttpResponse.json({ id: 9, name: (body as { name: string }).name, hostname: null, port: null, status: 'Unknown' });
    }),
    http.patch('/api/v3/servers/:id', async ({ request, params }) => {
      const body = await request.json();
      sent.push({ method: 'PATCH', path: `/servers/${params.id}`, body });
      return HttpResponse.json({ id: Number(params.id), name: (body as { name: string }).name, hostname: null, port: null, status: 'Unknown' });
    }),
    http.delete('/api/v3/servers/:id', ({ params }) => {
      sent.push({ method: 'DELETE', path: `/servers/${params.id}`, body: null });
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

async function mount() {
  const { default: Page } = await import('./settings.servers');
  return renderWithProviders(<Page />);
}

describe('ClassicSettingsServersPage', () => {
  it('renders the legacy table with monitor counts and load columns', async () => {
    signIn();
    seed();
    await mount();

    const edge01 = (await screen.findByRole('button', { name: 'edge-01' })).closest('tr')!;
    expect(within(edge01).getByText('3')).toBeInTheDocument();
    expect(within(edge01).getByText('http://10.0.0.3:8080')).toBeInTheDocument();
    expect(within(edge01).getByText('/zm/index.php')).toBeInTheDocument();
    expect(within(edge01).getByText('/zm/cgi-bin/nph-zms')).toBeInTheDocument();
    expect(within(edge01).getByText('/zm/api')).toBeInTheDocument();
    expect(within(edge01).getByText('Running')).toBeInTheDocument();
    // Two monitors point at server 3.
    expect(within(edge01).getByText('2')).toBeInTheDocument();
    // cpu_load 6.2 > 5 → legacy paints it as an error; assert the tone hook, not classes.
    expect(within(edge01).getByText('6.2')).toHaveAttribute('data-tone', 'error');
    // free mem 5% → error, free swap 90% → ok
    expect(within(edge01).getByText('5%')).toHaveAttribute('data-tone', 'error');
    expect(within(edge01).getByText('90%')).toHaveAttribute('data-tone', 'ok');
    expect(within(edge01).getByText('84.5%')).toBeInTheDocument();

    // No protocol on the row → the Url degrades to the bare host.
    const edge02 = screen.getByRole('button', { name: 'edge-02' }).closest('tr')!;
    expect(within(edge02).getByText('10.0.0.4')).toBeInTheDocument();
    expect(within(edge02).getByText('Not running')).toBeInTheDocument();
    // Three unset paths plus four missing stat cells.
    expect(within(edge02).getAllByText('—')).toHaveLength(7);

    // The read-only caveat is stated once for the page, not per field.
    expect(screen.getAllByText(
      'Only name, hostname, port and status are writable; the API does not accept the rest yet.',
    )).toHaveLength(1);
  });

  it('expands a row to the read-only daemon flags, run state and coordinates', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();

    const toggle = await screen.findByRole('button', { name: 'Details for edge-02' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const value = (label: string) =>
      screen.getByText(label).closest('div')!.querySelector('dd')!.textContent;
    expect(value('Run stats')).toBe('No');
    expect(value('Run audit')).toBe('No');
    expect(value('Run trigger')).toBe('Yes');
    expect(value('Run event notification')).toBe('Yes');
    expect(value('Protocol')).toBe('—');
    expect(value('Run state')).toBe('2');
    expect(value('Coordinates')).toBe('-37.81, 144.96');

    await user.click(toggle);
    expect(screen.queryByText('Run stats')).toBeNull();
  });

  it('offers the detail toggle without system Edit', async () => {
    signIn(VIEWER);
    seed();
    const user = userEvent.setup();
    await mount();
    await user.click(await screen.findByRole('button', { name: 'Details for edge-01' }));
    expect(screen.getByText('Run stats')).toBeInTheDocument();
  });

  it('shows the "this host" row when stats are recorded without a server id', async () => {
    signIn();
    seed([
      http.get('/api/v3/servers', () => HttpResponse.json(paged([]))),
      http.get('/api/v3/server-stats', ({ request }) => {
        const q = new URL(request.url).searchParams;
        if (q.get('page_size') === '1') return HttpResponse.json(paged([], { total: 1, per_page: 1 }));
        return HttpResponse.json(paged([{
          id: 1, server_id: null, time_stamp: '2026-08-21T10:00:00Z',
          cpu_load: '0.40', cpu_usage_percent: '12',
          total_mem: 1000, free_mem: 800, total_swap: 1000, free_swap: 1000,
        }], { total: 1 }));
      }),
    ] as never);
    await mount();

    expect(await screen.findByText('This host')).toBeInTheDocument();
    expect(screen.getByText(/stats recorded without a server id/)).toBeInTheDocument();
    expect(screen.getByText('0.4')).toBeInTheDocument();
    // Empty server list still renders the in-table hint row.
    expect(screen.getAllByText('No servers registered. The default install is single-node.').length).toBeGreaterThan(0);
  });

  it('renders the empty state when there are no servers and no local stats', async () => {
    signIn();
    seed([
      http.get('/api/v3/servers', () => HttpResponse.json(paged([]))),
      http.get('/api/v3/server-stats', () => HttpResponse.json(paged([], { total: 0 }))),
    ] as never);
    await mount();

    await waitFor(() => {
      const status = screen.getByRole('status');
      expect(status).toHaveAttribute('data-state', 'empty');
      expect(status).toHaveTextContent('No servers registered. The default install is single-node.');
    });
  });

  it('registers a server: POST /servers with the trimmed payload', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();
    await screen.findByRole('button', { name: 'edge-01' });

    await user.type(screen.getByLabelText('Name'), '  edge-03  ');
    await user.type(screen.getByLabelText('Host'), ' 10.0.0.9 ');
    // Port strips non-digits.
    await user.type(screen.getByLabelText('Port'), '80a80');
    await user.selectOptions(screen.getByLabelText('Status'), 'Running');
    await user.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({
      method: 'POST',
      path: '/servers',
      body: { name: 'edge-03', hostname: '10.0.0.9', port: 8080, status: 'Running' },
    });
  });

  it('Register is disabled without a name', async () => {
    signIn();
    seed();
    await mount();
    await screen.findByRole('button', { name: 'edge-01' });
    expect(screen.getByRole('button', { name: 'Register' })).toBeDisabled();
  });

  it('Edit loads the row into the form and Save PATCHes it; Cancel resets to New server', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();

    await user.click(await screen.findByRole('button', { name: 'Edit edge-01' }));
    expect(await screen.findByText('Edit server — edge-01')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('edge-01');
    expect(screen.getByLabelText('Port')).toHaveValue('8080');

    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'edge-01b');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({
      method: 'PATCH',
      path: '/servers/3',
      body: { name: 'edge-01b', hostname: '10.0.0.3', port: 8080, status: 'Running' },
    });
    // onSaved clears `editing`, so the form goes back to the register variant.
    await waitFor(() => expect(screen.getByText('New server')).toBeInTheDocument());

    // And the explicit Cancel path.
    await user.click(screen.getByRole('button', { name: 'Edit edge-02' }));
    expect(await screen.findByText('Edit server — edge-02')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('New server')).toBeInTheDocument();
  });

  it('clicking the name opens the same editor', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();
    await user.click(await screen.findByRole('button', { name: 'edge-01' }));
    expect(await screen.findByText('Edit server — edge-01')).toBeInTheDocument();
  });

  it('Delete confirms first, then DELETEs; cancelling sends nothing', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();

    await user.click(await screen.findByRole('button', { name: 'Delete edge-02' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Delete server "edge-02"?');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(sent).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Delete edge-02' }));
    const again = await screen.findByRole('dialog');
    await user.click(within(again).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(sent).toEqual([{ method: 'DELETE', path: '/servers/4', body: null }]));
  });

  it('surfaces a failed save in the form', async () => {
    signIn();
    seed([
      http.post('/api/v3/servers', () =>
        HttpResponse.json({ kind: 'VALIDATION', error_message: 'name already taken' }, { status: 422 })),
    ] as never);
    const user = userEvent.setup();
    await mount();
    await screen.findByRole('button', { name: 'edge-01' });

    await user.type(screen.getByLabelText('Name'), 'edge-01');
    await user.click(screen.getByRole('button', { name: 'Register' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Save failed: name already taken');
  });

  it('renders the 500 branch as an alert', async () => {
    signIn();
    seed([
      http.get('/api/v3/servers', () =>
        HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'Servers table locked' }, { status: 500 })),
    ] as never);
    await mount();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveAttribute('data-state', 'unreachable');
    expect(alert).toHaveTextContent('Cannot reach the server.');
  });

  it('renders a network failure as "Cannot reach the server."', async () => {
    signIn();
    seed([http.get('/api/v3/servers', () => HttpResponse.error())] as never);
    await mount();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveAttribute('data-state', 'unreachable');
  });

  it('renders the 403 branch as a permission notice', async () => {
    signIn();
    seed([
      http.get('/api/v3/servers', () =>
        HttpResponse.json({ kind: 'FORBIDDEN', error_message: 'nope' }, { status: 403 })),
    ] as never);
    await mount();
    await waitFor(() =>
      expect(screen.getByText('You do not have permission to view this.')).toBeInTheDocument());
  });

  it('surfaces a stats failure without hiding the table', async () => {
    signIn();
    seed([
      http.get('/api/v3/server-stats', () =>
        HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'stats unavailable' }, { status: 500 })),
    ] as never);
    await mount();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Load columns unavailable: stats unavailable'));
    expect(screen.getByRole('button', { name: 'edge-01' })).toBeInTheDocument();
  });

  it('read-only without system Edit: no form, no row verbs, names are plain text', async () => {
    signIn(VIEWER);
    seed();
    await mount();

    await waitFor(() => expect(screen.getByText('edge-01')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'edge-01' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit edge-01' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete edge-01' })).toBeNull();
    expect(screen.queryByText('New server')).toBeNull();
  });

  it('renders nothing when signed out', async () => {
    useAuthStore.setState({ accessToken: null, refreshToken: null, isAuthenticated: false, user: null });
    const { container } = await mount();
    expect(container).toBeEmptyDOMElement();
  });
});

/**
 * Groups page (classic skin) — legacy `?view=groups`: Mark / Name /
 * Monitors, the New and Delete toolbar verbs, and the modal that saves
 * name, parent and the whole `MonitorIds[]` set at once.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/components/common/toastStore';
import type { UserClaims } from '@/types';

vi.mock('@/skins/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const ALL_EDIT = {
  iat: 0, exp: 0, user: 'admin',
  perms: {
    stream: 'Edit', events: 'Edit', control: 'Edit', monitors: 'Edit',
    groups: 'Edit', devices: 'Edit', snapshots: 'Edit', system: 'Edit',
  },
} as unknown as UserClaims;

const VIEW_ONLY = {
  iat: 0, exp: 0, user: 'viewer',
  perms: {
    stream: 'View', events: 'View', control: 'None', monitors: 'View',
    groups: 'View', devices: 'None', snapshots: 'None', system: 'None',
  },
} as unknown as UserClaims;

function signIn(user: UserClaims = ALL_EDIT) {
  useAuthStore.setState({ accessToken: 't', refreshToken: 't', user, isAuthenticated: true });
}

const server = setupServer();
beforeAll(() => { server.listen({ onUnhandledRequest: 'error' }); });
beforeEach(() => { signIn(); });
afterEach(() => {
  server.resetHandlers();
  useToastStore.getState().clear();
});
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

function paged<T>(items: T[]) {
  return { items, total: items.length, per_page: 200, current_page: 1, last_page: 1 };
}

const GROUPS = [
  { id: 1, name: 'Outside', parent_id: null },
  { id: 2, name: 'Front', parent_id: 1 },
  { id: 3, name: 'Garage', parent_id: null },
];
const GROUP_MONITORS = [
  { id: 100, group_id: 1, monitor_id: 1 },
  { id: 101, group_id: 1, monitor_id: 2 },
  { id: 102, group_id: 3, monitor_id: 2 },
];
const MONITORS = [
  { id: 1, name: 'Front Door', width: 1920, height: 1080, orientation: 'ROTATE_0', type: 'Ffmpeg', capturing: 'Always', analysing: 'Always', recording: 'OnMotion', enabled: 1 },
  { id: 2, name: 'Driveway', width: 1280, height: 720, orientation: 'ROTATE_90', type: 'Ffmpeg', capturing: 'Always', analysing: 'None', recording: 'None', enabled: 1 },
];

/** Config reads behind `useSiteTitle`. */
function configHandlers() {
  return http.get('/api/v3/configs/:name', ({ params }) =>
    HttpResponse.json({ name: String(params.name), value: 'ZM' }));
}

function stub({
  groups = GROUPS,
  groupMonitors = GROUP_MONITORS,
  monitors = MONITORS,
}: { groups?: unknown[]; groupMonitors?: unknown[]; monitors?: unknown[] } = {}) {
  server.use(
    configHandlers(),
    http.get('/api/v3/groups', () => HttpResponse.json(paged(groups))),
    http.get('/api/v3/groups-monitors', () => HttpResponse.json(paged(groupMonitors))),
    http.get('/api/v3/monitors', () => HttpResponse.json(paged(monitors))),
  );
}

async function mount() {
  const { default: Page } = await import('./groups');
  return renderWithProviders(<Page />);
}

describe('ClassicGroupsPage', () => {
  it('renders the legacy Mark / Name / Monitors table, indented by depth', async () => {
    stub();
    await mount();

    const table = await screen.findByRole('table');
    const header = within(table).getAllByRole('row')[0];
    expect(within(header).getAllByRole('columnheader').map((th) => th.textContent))
      .toEqual(['Mark', 'Name', 'Monitors']);

    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);

    // Depth-first: Outside, its child Front, then Garage. Names read "Id Name".
    expect(within(rows[0]).getByRole('button', { name: '1 Outside' })).toBeInTheDocument();
    expect(rows[0].getAttribute('data-depth')).toBe('0');
    expect(within(rows[1]).getByRole('button', { name: '2 Front' })).toBeInTheDocument();
    expect(rows[1].getAttribute('data-depth')).toBe('1');
    expect(rows[2].getAttribute('data-depth')).toBe('0');

    // Monitors column lists names, joined — Outside holds both, Front none.
    expect(within(rows[0]).getByText('Front Door, Driveway')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Driveway')).toBeInTheDocument();
  });

  it('shows the empty state when there are no groups', async () => {
    stub({ groups: [], groupMonitors: [] });
    await mount();

    expect(await screen.findByText('No groups yet. Click "New" to create one.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('renders the backend error instead of an empty table', async () => {
    server.use(
      configHandlers(),
      http.get('/api/v3/groups', () =>
        HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'groups table locked' }, { status: 500 })),
      http.get('/api/v3/groups-monitors', () => HttpResponse.json(paged([]))),
      http.get('/api/v3/monitors', () => HttpResponse.json(paged([]))),
    );
    await mount();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Cannot reach the server.');
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('reports a dead backend as unreachable', async () => {
    server.use(
      configHandlers(),
      http.get('/api/v3/groups', () => HttpResponse.error()),
      http.get('/api/v3/groups-monitors', () => HttpResponse.json(paged([]))),
      http.get('/api/v3/monitors', () => HttpResponse.json(paged([]))),
    );
    await mount();

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server.');
  });

  it('drops the verbs and the Mark column for a groups-View user', async () => {
    signIn(VIEW_ONLY);
    stub();
    await mount();

    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent))
      .toEqual(['Name', 'Monitors']);
    expect(screen.queryByRole('button', { name: 'New' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    // Plain text, no edit link.
    expect(screen.getByText('Outside')).toBeInTheDocument();
  });

  it('POSTs a new group with the chosen parent and its monitors', async () => {
    const user = userEvent.setup();
    stub();
    let body: unknown;
    const attached: unknown[] = [];
    server.use(
      http.post('/api/v3/groups', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: 9, name: 'Side Gate', parent_id: 1 });
      }),
      http.post('/api/v3/groups-monitors', async ({ request }) => {
        attached.push(await request.json());
        return HttpResponse.json({ id: 300, group_id: 9, monitor_id: 1 });
      }),
    );
    await mount();

    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'New' }));

    const dialog = await screen.findByRole('dialog', { name: 'Create group' });
    await user.type(within(dialog).getByLabelText('Name'), 'Side Gate');
    await user.selectOptions(within(dialog).getByLabelText('Parent'), '1');
    await user.selectOptions(within(dialog).getByLabelText('Monitors'), '1');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(body).toEqual({ name: 'Side Gate', parent_id: 1 }));
    await waitFor(() => expect(attached).toEqual([{ group_id: 9, monitor_id: 1 }]));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('PUTs a rename with the new parent and closes', async () => {
    const user = userEvent.setup();
    stub();
    const requests: Array<{ url: string; method: string; body: unknown }> = [];
    server.use(
      http.put('/api/v3/groups/:id', async ({ request, params }) => {
        requests.push({ url: `/groups/${params.id}`, method: request.method, body: await request.json() });
        return HttpResponse.json({ id: 3, name: 'Garage Bay', parent_id: 1 });
      }),
      http.delete('/api/v3/groups-monitors/:id', () => new HttpResponse(null, { status: 204 })),
    );
    await mount();

    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: '3 Garage' }));

    const dialog = await screen.findByRole('dialog', { name: 'Edit group' });
    const name = within(dialog).getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Garage Bay');
    await user.selectOptions(within(dialog).getByLabelText('Parent'), '1');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].method).toBe('PUT');
    expect(requests[0].url).toBe('/groups/3');
    expect(requests[0].body).toEqual({ name: 'Garage Bay', parent_id: 1 });

    // Re-parenting persists (zm-api#28) — nothing to warn about any more.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('seeds the modal with the group monitors and saves the whole set as a diff', async () => {
    const user = userEvent.setup();
    stub();
    const attached: unknown[] = [];
    const detached: string[] = [];
    server.use(
      http.put('/api/v3/groups/:id', () => HttpResponse.json({ id: 1, name: 'Outside', parent_id: null })),
      http.post('/api/v3/groups-monitors', async ({ request }) => {
        attached.push(await request.json());
        return HttpResponse.json({ id: 301, group_id: 1, monitor_id: 1 });
      }),
      http.delete('/api/v3/groups-monitors/:id', ({ params }) => {
        detached.push(String(params.id));
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await mount();

    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: '1 Outside' }));

    const dialog = await screen.findByRole('dialog', { name: 'Edit group' });
    const select = within(dialog).getByLabelText('Monitors') as HTMLSelectElement;
    // Both of Outside's monitors arrive selected.
    expect(Array.from(select.selectedOptions, (o) => o.value)).toEqual(['1', '2']);

    // Keep only Driveway (2): row 100 (Front Door) is detached, nothing added.
    await user.deselectOptions(select, '1');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(detached).toEqual(['100']));
    expect(attached).toEqual([]);
  });

  it('confirms (listing marked groups) before DELETEing them', async () => {
    const user = userEvent.setup();
    stub();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const deleted: string[] = [];
    server.use(
      http.delete('/api/v3/groups/:id', ({ params }) => {
        deleted.push(String(params.id));
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await mount();

    await screen.findByRole('table');
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'Mark Outside' }));
    await user.click(screen.getByRole('checkbox', { name: 'Mark Garage' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(deleted.sort()).toEqual(['1', '3']));
    expect(confirm.mock.calls[0][0]).toContain('Outside');
    expect(confirm.mock.calls[0][0]).toContain('Garage');
  });

  it('does not DELETE when the confirm is dismissed', async () => {
    const user = userEvent.setup();
    stub();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const deleted: string[] = [];
    server.use(
      http.delete('/api/v3/groups/:id', ({ params }) => {
        deleted.push(String(params.id));
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await mount();

    await screen.findByRole('table');
    await user.click(screen.getByRole('checkbox', { name: 'Mark Garage' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await new Promise((r) => setTimeout(r, 20));
    expect(deleted).toEqual([]);
  });

  it('surfaces a create failure in the dialog instead of closing it', async () => {
    const user = userEvent.setup();
    stub();
    server.use(
      http.post('/api/v3/groups', () =>
        HttpResponse.json({ kind: 'VALIDATION', error_message: 'name already taken' }, { status: 409 })),
    );
    await mount();

    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'New' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create group' });
    await user.type(within(dialog).getByLabelText('Name'), 'Outside');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('name already taken');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

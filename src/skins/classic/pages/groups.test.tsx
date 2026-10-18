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

  it('greys the verbs and drops the Mark column for a groups-View user, as legacy does', async () => {
    signIn(VIEW_ONLY);
    stub();
    await mount();

    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent))
      .toEqual(['Name', 'Monitors']);
    // groups.php renders New with disabled="disabled", and Delete starts disabled.
    expect(screen.getByRole('button', { name: 'New' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
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

    // Legacy's title for a new group is just "Group".
    const dialog = await screen.findByRole('dialog', { name: 'Group' });
    const save = within(dialog).getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Name'), 'Side Gate');
    expect(save).toBeEnabled();
    await user.selectOptions(within(dialog).getByLabelText('Parent Group'), '1');
    // The chosen-style picker: type to filter, pick from the list.
    await user.type(within(dialog).getByRole('combobox', { name: 'Monitor' }), 'front');
    await user.click(within(dialog).getByRole('option', { name: 'Front Door' }));
    expect(within(dialog).getByRole('button', { name: 'Remove Front Door' })).toBeInTheDocument();
    await user.click(save);

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

    const dialog = await screen.findByRole('dialog', { name: 'Group - Garage' });
    const name = within(dialog).getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Garage Bay');
    await user.selectOptions(within(dialog).getByLabelText('Parent Group'), '1');
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

    const dialog = await screen.findByRole('dialog', { name: 'Group - Outside' });
    // Both of Outside's monitors arrive picked.
    expect(within(dialog).getByRole('button', { name: 'Remove Front Door' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Remove Driveway' })).toBeInTheDocument();

    // Keep only Driveway (2): row 100 (Front Door) is detached, nothing added.
    await user.click(within(dialog).getByRole('button', { name: 'Remove Front Door' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(detached).toEqual(['100']));
    expect(attached).toEqual([]);
  });

  it('asks in legacy\'s confirmation modal before DELETEing the marked groups', async () => {
    const user = userEvent.setup();
    stub();
    const confirm = vi.spyOn(window, 'confirm');
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

    const modal = await screen.findByRole('dialog', { name: 'Delete' });
    expect(modal).toHaveTextContent('Are you sure you wish to delete the selected groups?');
    expect(deleted).toEqual([]);
    await user.click(within(modal).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(deleted.sort()).toEqual(['1', '3']));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('does not DELETE when the confirmation is cancelled', async () => {
    const user = userEvent.setup();
    stub();
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
    const modal = await screen.findByRole('dialog', { name: 'Delete' });
    await user.click(within(modal).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(deleted).toEqual([]);
    // The marks survive a cancel.
    expect(screen.getByRole('checkbox', { name: 'Mark Garage' })).toBeChecked();
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
    const dialog = await screen.findByRole('dialog', { name: 'Group' });
    await user.type(within(dialog).getByLabelText('Name'), 'Outside');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('name already taken');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('lists parent groups as legacy does: None, then by name, indented, never itself or below', async () => {
    const user = userEvent.setup();
    stub({
      groups: [
        { id: 1, name: 'Outside', parent_id: null },
        { id: 2, name: 'Front', parent_id: 1 },
        { id: 4, name: 'Porch', parent_id: 2 },
        { id: 3, name: 'Garage', parent_id: null },
        { id: 5, name: 'Attic', parent_id: null },
      ],
    });
    await mount();
    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: '2 Front' }));

    const dialog = await screen.findByRole('dialog', { name: 'Group - Front' });
    const parent = within(dialog).getByLabelText('Parent Group') as HTMLSelectElement;
    // Front and its child Porch are left out; the rest by name.
    expect(Array.from(parent.options, (o) => o.textContent)).toEqual(['None', 'Attic', 'Garage', 'Outside']);
    expect(parent).toHaveValue('1');
  });

  it('indents a nested parent option by its depth', async () => {
    const user = userEvent.setup();
    stub();
    await mount();
    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'New' }));
    const dialog = await screen.findByRole('dialog', { name: 'Group' });
    const parent = within(dialog).getByLabelText('Parent Group') as HTMLSelectElement;
    expect(Array.from(parent.options, (o) => o.textContent))
      .toEqual(['None', '\u00a0\u00a0Front', 'Garage', 'Outside']);
  });

  it('picks monitors from the keyboard and drops the last with Backspace, as chosen does', async () => {
    const user = userEvent.setup();
    stub();
    await mount();
    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'New' }));
    const dialog = await screen.findByRole('dialog', { name: 'Group' });
    const box = within(dialog).getByRole('combobox', { name: 'Monitor' });

    await user.click(box);
    await user.keyboard('{ArrowDown}{Enter}');
    expect(within(dialog).getByRole('button', { name: 'Remove Driveway' })).toBeInTheDocument();

    await user.type(box, 'zzz');
    expect(within(dialog).getByText('No results match "zzz"')).toBeInTheDocument();
    await user.clear(box);
    await user.keyboard('{Backspace}');
    expect(within(dialog).queryByRole('button', { name: 'Remove Driveway' })).toBeNull();
  });

  it('renders no heading of its own: legacy\'s groups page starts at the toolbar', async () => {
    stub();
    await mount();
    await screen.findByRole('table');
    expect(screen.queryByRole('heading', { name: 'Groups' })).toBeNull();
  });
});

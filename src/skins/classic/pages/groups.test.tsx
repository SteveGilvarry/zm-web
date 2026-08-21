/**
 * Groups page (classic skin) — legacy `?view=groups`: the indented group
 * table with monitor counts, the membership checkbox list, the New/Edit/
 * Delete verbs and the re-parent save path.
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
  it('renders the indented tree with parent names and monitor counts', async () => {
    stub();
    await mount();

    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row').slice(1); // drop the header
    expect(rows).toHaveLength(3);

    // Depth-first: Outside, its child Front, then Garage.
    expect(within(rows[0]).getByText('Outside')).toBeInTheDocument();
    expect(rows[0].getAttribute('data-depth')).toBe('0');
    expect(within(rows[1]).getByText('Front')).toBeInTheDocument();
    expect(rows[1].getAttribute('data-depth')).toBe('1');
    // Child row names its parent.
    expect(within(rows[1]).getByText('Outside')).toBeInTheDocument();
    expect(rows[2].getAttribute('data-depth')).toBe('0');

    // Monitor counts come from groups-monitors: Outside 2, Front 0, Garage 1.
    expect(within(rows[0]).getByText('2')).toBeInTheDocument();
    expect(within(rows[1]).getByText('0')).toBeInTheDocument();
    expect(within(rows[2]).getByText('1')).toBeInTheDocument();
  });

  it('defaults the member panel to the first group and ticks its monitors', async () => {
    stub();
    await mount();

    expect(await screen.findByText('Members — Outside')).toBeInTheDocument();
    const front = screen.getByRole('checkbox', { name: 'Remove Front Door from group' });
    const drive = screen.getByRole('checkbox', { name: 'Remove Driveway from group' });
    expect(front).toBeChecked();
    expect(drive).toBeChecked();
  });

  it('switches the member panel when another group row is clicked', async () => {
    const user = userEvent.setup();
    stub();
    await mount();

    await screen.findByText('Members — Outside');
    await user.click(screen.getByText('Garage'));

    expect(await screen.findByText('Members — Garage')).toBeInTheDocument();
    // Garage only holds monitor 2.
    expect(screen.getByRole('checkbox', { name: 'Add Front Door to group' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Remove Driveway from group' })).toBeChecked();
  });

  it('shows the empty state when there are no groups', async () => {
    stub({ groups: [], groupMonitors: [] });
    await mount();

    expect(await screen.findByText('No groups yet. Click "New group" to create one.')).toBeInTheDocument();
    expect(screen.getByText('Select a group to manage its monitors.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('says so when the group list has no monitors to offer', async () => {
    stub({ monitors: [] });
    await mount();

    expect(await screen.findByText('No monitors configured.')).toBeInTheDocument();
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

  it('hides every verb and freezes the checkboxes for a groups-View user', async () => {
    signIn(VIEW_ONLY);
    stub();
    await mount();

    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: 'New group' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit group Outside' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete group Outside' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Remove Front Door from group' })).toBeDisabled();
  });

  it('POSTs a new group with the chosen parent', async () => {
    const user = userEvent.setup();
    stub();
    let body: unknown;
    server.use(
      http.post('/api/v3/groups', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: 9, name: 'Side Gate', parent_id: 1 });
      }),
    );
    await mount();

    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'New group' }));

    const dialog = await screen.findByRole('dialog', { name: 'Create group' });
    await user.type(within(dialog).getByLabelText('Name'), 'Side Gate');
    await user.selectOptions(within(dialog).getByLabelText('Parent'), '1');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(body).toEqual({ name: 'Side Gate', parent_id: 1 }));
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
    );
    await mount();

    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Edit group Garage' }));

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

  it('confirms (listing descendants) before DELETEing a group', async () => {
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
    await user.click(screen.getByRole('button', { name: 'Delete group Outside' }));

    await waitFor(() => expect(deleted).toEqual(['1']));
    // Outside has one descendant (Front) so the prompt lists it.
    expect(confirm.mock.calls[0][0]).toContain('Front');
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
    await user.click(screen.getByRole('button', { name: 'Delete group Garage' }));

    await new Promise((r) => setTimeout(r, 20));
    expect(deleted).toEqual([]);
  });

  it('POSTs groups-monitors when a monitor is ticked into the group', async () => {
    const user = userEvent.setup();
    stub();
    let body: unknown;
    server.use(
      http.post('/api/v3/groups-monitors', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: 200, group_id: 3, monitor_id: 1 });
      }),
    );
    await mount();

    await screen.findByText('Members — Outside');
    await user.click(screen.getByText('Garage'));
    await screen.findByText('Members — Garage');

    await user.click(screen.getByRole('checkbox', { name: 'Add Front Door to group' }));
    await waitFor(() => expect(body).toEqual({ group_id: 3, monitor_id: 1 }));
  });

  it('DELETEs the membership row when a monitor is unticked', async () => {
    const user = userEvent.setup();
    stub();
    const deleted: string[] = [];
    server.use(
      http.delete('/api/v3/groups-monitors/:id', ({ params }) => {
        deleted.push(String(params.id));
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await mount();

    await screen.findByText('Members — Outside');
    await user.click(screen.getByRole('checkbox', { name: 'Remove Driveway from group' }));

    // Membership row 101 links Outside (1) to Driveway (2).
    await waitFor(() => expect(deleted).toEqual(['101']));
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
    await user.click(screen.getByRole('button', { name: 'New group' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create group' });
    await user.type(within(dialog).getByLabelText('Name'), 'Outside');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('name already taken');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

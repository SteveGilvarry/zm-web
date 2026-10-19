/**
 * The role editor (classic): legacy `role.php` — Role Details, Global
 * Permissions, Assigned Users; Save / Cancel; name required and unique.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { configListHandler } from '@/test/msw/handlers';
import { makeRole } from '@/test/fixtures/optionsAdmin';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/components/common/toastStore';

const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, search, ...rest }: { children: ReactNode; to?: string; search?: { uid?: number } }) => (
    <a href={`${to ?? '#'}${search?.uid != null ? `?uid=${search.uid}` : ''}`} {...rest}>{children}</a>
  ),
  useSearch: () => ({}),
  useNavigate: () => mockNavigate,
}));
vi.mock('@/skins/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const ALL_EDIT = {
  stream: 'Edit', events: 'Edit', control: 'Edit', monitors: 'Edit',
  groups: 'Edit', devices: 'Edit', snapshots: 'Edit', system: 'Edit',
};
const ADMIN = { iat: 0, exp: 4102444800, user: 'admin', uid: 1, perms: ALL_EDIT };
const VIEWER = { ...ADMIN, user: 'ops', uid: 2, perms: { ...ALL_EDIT, system: 'View' } };

function signIn(user: unknown = ADMIN) {
  useAuthStore.setState({ accessToken: 't', refreshToken: 't', isAuthenticated: true, user: user as never });
}

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  useToastStore.getState().clear();
  mockNavigate.mockClear();
});
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

const paged = <T,>(items: T[]) => ({ items, total: items.length, per_page: 1000, current_page: 1, last_page: 1 });

const OPS = makeRole({ id: 3, name: 'Operators', description: 'Day shift', events: 'Edit', monitors: 'View' });
const ROLES = [OPS, makeRole({ id: 4, name: 'Auditors' })];
const USERS = [
  { id: 7, username: 'zoe', name: 'Zoe Z', email: '', enabled: 1, role_id: 3 },
  { id: 8, username: 'al', name: 'Al A', email: '', enabled: 1, role_id: 3 },
  { id: 9, username: 'other', name: '', email: '', enabled: 1, role_id: 4 },
];

let sent: Array<{ method: string; path: string; body: unknown }> = [];
function seed(snapshots = '0') {
  sent = [];
  server.use(
    http.get('/api/v3/me', () => HttpResponse.json({}, { status: 404 })),
    configListHandler({ ZM_FEATURES_SNAPSHOTS: snapshots }),
    http.get('/api/v3/roles', () => HttpResponse.json(paged(ROLES))),
    http.get('/api/v3/roles/:id', ({ params }) => {
      const role = ROLES.find((r) => r.id === Number(params.id));
      return role ? HttpResponse.json(role) : HttpResponse.json({ error: 'not found' }, { status: 404 });
    }),
    http.get('/api/v3/users', () => HttpResponse.json(paged(USERS))),
    http.put('/api/v3/roles/:id', async ({ request, params }) => {
      sent.push({ method: 'PUT', path: `/roles/${params.id}`, body: await request.json() });
      return HttpResponse.json(OPS);
    }),
    http.post('/api/v3/roles', async ({ request }) => {
      const body = await request.json();
      sent.push({ method: 'POST', path: '/roles', body });
      return HttpResponse.json({ ...makeRole(), ...(body as object), id: 9 }, { status: 201 });
    }),
  );
}

async function mount(roleId: number) {
  const { default: Page } = await import('./settings.roles.edit');
  return renderWithProviders(<Page roleId={roleId} />);
}

describe('ClassicRoleEditorPage', () => {
  it('fills Role Details and Global Permissions from the role, and lists its users', async () => {
    signIn();
    seed();
    await mount(3);
    expect(await screen.findByRole('heading', { name: 'Role - Operators' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('Operators'));
    expect(screen.getByLabelText('Description')).toHaveValue('Day shift');
    expect(screen.getByLabelText('Events')).toHaveValue('Edit');
    expect(screen.getByLabelText('Monitors')).toHaveValue('View');
    // Stream offers None/View only; Monitors adds Create.
    expect([...(screen.getByLabelText('Stream') as HTMLSelectElement).options].map((o) => o.value)).toEqual(['None', 'View']);
    expect([...(screen.getByLabelText('Monitors') as HTMLSelectElement).options].map((o) => o.value))
      .toEqual(['None', 'View', 'Edit', 'Create']);
    // Snapshots only with ZM_FEATURES_SNAPSHOTS.
    expect(screen.queryByLabelText('Snapshots')).toBeNull();

    const assigned = screen.getByRole('group', { name: 'Assigned Users' });
    const links = await within(assigned).findAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['al', 'zoe']);
    expect(links[1]).toHaveAttribute('href', '/settings/users?uid=7');
  });

  it('shows the Snapshots select when snapshots are on', async () => {
    signIn();
    seed('1');
    await mount(3);
    expect(await screen.findByLabelText('Snapshots')).toBeInTheDocument();
  });

  it('Save sends only the changed fields and returns to the list', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount(3);
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('Operators'));
    await user.selectOptions(screen.getByLabelText('System'), 'View');
    await user.clear(screen.getByLabelText('Description'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ method: 'PUT', path: '/roles/3', body: { system: 'View', description: null } });
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/settings/roles' }));
  });

  it('rid 0 creates: blank form, no Assigned Users, POST with every level', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount(0);
    expect(screen.getByLabelText('Name')).toHaveAttribute('placeholder', 'New Role');
    expect(screen.queryByRole('group', { name: 'Assigned Users' })).toBeNull();
    await user.type(screen.getByLabelText('Name'), 'Night');
    await user.selectOptions(screen.getByLabelText('Stream'), 'View');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({
      method: 'POST',
      path: '/roles',
      body: {
        name: 'Night', stream: 'View', events: 'None', control: 'None', monitors: 'None',
        groups: 'None', snapshots: 'None', system: 'None', devices: 'None',
      },
    });
  });

  it('refuses a blank or duplicate name, as actions/role.php does', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount(0);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Role name is required');
    await user.type(screen.getByLabelText('Name'), 'Auditors');
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('Auditors'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('There already exists a role with this Name');
    expect(sent).toHaveLength(0);
  });

  it('Cancel and Back return to the list', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount(3);
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(mockNavigate).toHaveBeenCalledTimes(2);
  });

  it('says "No users assigned" for an unused role', async () => {
    signIn();
    seed();
    server.use(http.get('/api/v3/users', () => HttpResponse.json(paged([]))));
    await mount(3);
    expect(await screen.findByText('No users assigned to this role')).toBeInTheDocument();
  });

  it('needs System Edit, as role.php does', async () => {
    signIn(VIEWER);
    seed();
    await mount(3);
    expect(screen.queryByLabelText('Name')).toBeNull();
  });
});

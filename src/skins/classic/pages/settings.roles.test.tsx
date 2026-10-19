/**
 * Options → Roles (classic): legacy `_options_roles.php` — Mark, Name,
 * Description, the eight levels, Users count; Add New Role and Delete.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { makeRole } from '@/test/fixtures/optionsAdmin';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/components/common/toastStore';

const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params, ...rest }: { children: ReactNode; to?: string; params?: Record<string, string>; search?: unknown }) => {
    delete rest.search;
    const href = (to ?? '#').replace('$roleId', params?.roleId ?? '$roleId');
    return <a href={href} {...rest}>{children}</a>;
  },
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

const ROLES = [
  makeRole({ id: 2, name: 'Viewers', description: 'Look, do not touch', stream: 'View', events: 'View' }),
  makeRole({ id: 1, name: 'Admins', system: 'Edit', monitors: 'Create', devices: 'Edit' }),
];
const USERS = [
  { id: 1, username: 'admin', name: '', email: '', enabled: 1, role_id: 1 },
  { id: 2, username: 'a', name: '', email: '', enabled: 1, role_id: 2 },
  { id: 3, username: 'b', name: '', email: '', enabled: 1, role_id: 2 },
  { id: 4, username: 'c', name: '', email: '', enabled: 1, role_id: null },
];

let deleted: number[] = [];
function seed() {
  deleted = [];
  server.use(
    http.get('/api/v3/configs/categories', () => HttpResponse.json([{ category: 'system', count: 1 }])),
    http.get('/api/v3/configs', () => HttpResponse.json(paged([]))),
    http.get('/api/v3/me', () => HttpResponse.json({}, { status: 404 })),
    http.get('/api/v3/roles', () => HttpResponse.json(paged(ROLES))),
    http.get('/api/v3/users', () => HttpResponse.json(paged(USERS))),
    http.delete('/api/v3/roles/:id', ({ params }) => {
      deleted.push(Number(params.id));
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

async function mount() {
  const { default: Page } = await import('./settings.roles');
  return renderWithProviders(<Page />);
}

describe('ClassicSettingsRolesPage', () => {
  it('lists roles by name with legacy columns, levels as text and user counts', async () => {
    signIn();
    seed();
    await mount();
    const admins = await screen.findByRole('link', { name: 'Admins' });
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getAllByRole('cell')[1].textContent)).toEqual(['Admins', 'Viewers']);

    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent?.replace(/[▲▼⇅]/g, '').trim());
    expect(headers.slice(1)).toEqual([
      'Name', 'Description', 'Stream', 'Events', 'Control', 'Monitors', 'Groups', 'Snapshots', 'System', 'Devices', 'Users',
    ]);
    expect(admins).toHaveAttribute('href', '/settings/roles/1');
    const adminCells = within(admins.closest('tr')!).getAllByRole('cell').map((c) => c.textContent);
    expect(adminCells.slice(3)).toEqual(['View', 'View', 'None', 'Create', 'None', 'None', 'Edit', 'Edit', '1']);
    const viewers = within(screen.getByRole('link', { name: 'Viewers' }).closest('tr')!).getAllByRole('cell');
    expect(viewers[2]).toHaveTextContent('Look, do not touch');
    await waitFor(() => expect(viewers.at(-1)).toHaveTextContent('2'));

    // The rail carries the Roles tab, highlighted.
    expect(screen.getByRole('link', { name: 'Roles' })).toHaveAttribute('aria-current', 'page');
  });

  it('sorts by a column header', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();
    await screen.findByRole('link', { name: 'Admins' });
    await user.click(screen.getByRole('button', { name: /^Name/ }));
    const names = screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[1].textContent);
    expect(names).toEqual(['Viewers', 'Admins']);
  });

  it('Add New Role opens rid 0', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();
    await user.click(await screen.findByRole('button', { name: 'Add New Role' }));
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/settings/roles/$roleId', params: { roleId: '0' } });
  });

  it('Delete is off until a role is marked, then confirms and DELETEs each', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();
    await screen.findByRole('link', { name: 'Admins' });
    const del = screen.getByRole('button', { name: 'Delete' });
    expect(del).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    expect(del).toBeEnabled();
    await user.click(del);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Delete 2 roles?');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleted.sort()).toEqual([1, 2]));
  });

  it('a System viewer sees the table but cannot add, mark or open', async () => {
    signIn(VIEWER);
    seed();
    await mount();
    await screen.findByText('Admins');
    expect(screen.queryByRole('link', { name: 'Admins' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add New Role' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Mark Admins' })).toBeDisabled();
  });

  it('shows the empty message when there are no roles', async () => {
    signIn();
    seed();
    server.use(http.get('/api/v3/roles', () => HttpResponse.json(paged([]))));
    await mount();
    expect(await screen.findByText('No matching records found')).toBeInTheDocument();
  });
});

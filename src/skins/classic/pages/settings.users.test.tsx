/**
 * Options → Users (classic skin): the legacy user table with its permission
 * columns, mark checkboxes, enable toggle, export verbs and the delete
 * confirm — plus the self-row rules (starred, never selectable).
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/components/common/toastStore';

let mockSearch: Record<string, unknown> = {};
const mockNavigate = vi.fn((opts: { search?: (prev: Record<string, unknown>) => Record<string, unknown> }) => {
  mockSearch = opts.search?.({ ...mockSearch }) ?? {};
});
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: ReactNode; to?: string; search?: unknown }) => {
    delete rest.search;
    return <a href={to ?? '#'} {...rest}>{children}</a>;
  },
  useSearch: () => ({ ...mockSearch }),
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
const OUTSIDER = { ...ADMIN, user: 'nobody', uid: 9, perms: { ...ALL_EDIT, system: 'None' } };

function signIn(user: unknown = ADMIN) {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', isAuthenticated: true, user: user as never,
  });
}

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  useToastStore.getState().clear();
  mockSearch = {};
  mockNavigate.mockClear();
});
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

const paged = <T,>(items: T[], over: Record<string, number> = {}) => ({
  items, total: items.length, per_page: 1000, current_page: 1, last_page: 1, ...over,
});

const mkUser = (over: Partial<Record<string, unknown>>) => ({
  id: 0, username: '', name: '', email: '', enabled: 1,
  stream: 'View', events: 'View', control: 'None', monitors: 'None',
  groups: 'None', devices: 'None', snapshots: 'None', system: 'None',
  ...over,
});

const USERS = [
  mkUser({ id: 1, username: 'admin', name: 'Site Admin', email: 'admin@example.com', system: 'Edit', monitors: 'Edit' }),
  mkUser({ id: 2, username: 'ops', name: 'Ops Team', email: 'ops@example.com', enabled: 0, system: 'View' }),
  mkUser({ id: 3, username: 'guest', name: 'Guest', email: 'guest@example.com' }),
];

let sent: Array<{ method: string; path: string; body: unknown }> = [];

function seed(over: unknown[] = [], selfEdit = '0') {
  sent = [];
  server.use(
    ...(over as never[]),
    http.get('/api/v3/configs/categories', () => HttpResponse.json([{ category: 'system', count: 2 }])),
    http.get('/api/v3/configs/:name', ({ params }) => HttpResponse.json({
      id: 0, name: params.name, type: 'string', category: 'web', readonly: 0,
      value: params.name === 'ZM_USER_SELF_EDIT' ? selfEdit : '',
    })),
    http.get('/api/v3/users', () => HttpResponse.json(paged(USERS))),
    http.get('/api/v3/users/:id', ({ params }) =>
      HttpResponse.json(USERS.find((u) => u.id === Number(params.id)) ?? USERS[0])),
    http.put('/api/v3/users/:id', async ({ request, params }) => {
      const body = await request.json();
      sent.push({ method: 'PUT', path: `/users/${params.id}`, body });
      return HttpResponse.json({ ...USERS[0], id: Number(params.id) });
    }),
    http.delete('/api/v3/users/:id', ({ params }) => {
      sent.push({ method: 'DELETE', path: `/users/${params.id}`, body: null });
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

async function mount() {
  const { default: Page } = await import('./settings.users');
  return renderWithProviders(<Page />);
}

describe('ClassicSettingsUsersPage', () => {
  it('renders the legacy table with the permission columns and stars the signed-in user', async () => {
    signIn();
    seed();
    await mount();

    const row = (await screen.findByRole('button', { name: 'admin' })).closest('tr')!;
    expect(within(row).getByText('Site Admin')).toBeInTheDocument();
    expect(within(row).getByText('admin@example.com')).toBeInTheDocument();
    // The permission columns are the raw level strings.
    expect(within(row).getAllByText('Edit')).toHaveLength(2);   // monitors + system
    // Signed-in row: starred, and its mark checkbox is disabled.
    expect(within(row).getByTitle('You')).toHaveTextContent('*');
    expect(within(row).getByRole('checkbox', { name: 'Mark admin' })).toBeDisabled();
    // Own enable toggle is not offered — the cell falls back to Yes/No.
    expect(within(row).queryByRole('checkbox', { name: /able admin/ })).toBeNull();
    expect(within(row).getByText('Yes')).toBeInTheDocument();

    // Sorted by username: guest, then admin/ops around it.
    const usernames = screen.getAllByRole('row').slice(1).map((r) => r.querySelector('td:nth-child(2)')?.textContent);
    expect(usernames).toEqual(['admin*', 'guest', 'ops']);
    expect(screen.getByText('Showing 3 of 3 rows')).toBeInTheDocument();
  });

  it('search narrows across username, name and email', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();
    await screen.findByRole('button', { name: 'admin' });

    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'ops@');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'admin' })).toBeNull());
    expect(screen.getByRole('button', { name: 'ops' })).toBeInTheDocument();
    expect(screen.getByText('Showing 1 of 1 rows')).toBeInTheDocument();

    await user.clear(screen.getByRole('searchbox', { name: 'Search' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'Guest');
    await waitFor(() => expect(screen.getByRole('button', { name: 'guest' })).toBeInTheDocument());

    await user.clear(screen.getByRole('searchbox', { name: 'Search' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'zzz');
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveAttribute('data-state', 'empty'));
  });

  it('the enable toggle PUTs a 0/1 int', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();

    await user.click(await screen.findByRole('checkbox', { name: 'Enable ops' }));
    await waitFor(() => expect(sent).toEqual([
      { method: 'PUT', path: '/users/2', body: { enabled: 1 } },
    ]));
  });

  it('select-all marks everyone but the signed-in user, and Delete confirms then DELETEs', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();

    // The toolbar paints before the list resolves; wait for a row.
    await screen.findByRole('button', { name: 'admin' });
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    expect(screen.getByRole('checkbox', { name: 'Mark guest' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Mark ops' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Mark admin' })).not.toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Delete 2 users? This cannot be undone.');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent.map((r) => r.path).sort()).toEqual(['/users/2', '/users/3']);
  });

  it('marking a single user names it in the confirm; Cancel sends nothing', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();

    await user.click(await screen.findByRole('checkbox', { name: 'Mark guest' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Are you sure you want to delete user "guest"? This cannot be undone.');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(sent).toHaveLength(0);
  });

  it('Export CSV and Export JSON download the whole matching set', async () => {
    signIn();
    seed();
    // jsdom has no object-URL support; patch just those two methods so the
    // download helper runs, and put them back afterwards.
    type UrlStatics = { createObjectURL?: unknown; revokeObjectURL?: unknown };
    const urlStatics = URL as unknown as UrlStatics;
    const saved = { create: urlStatics.createObjectURL, revoke: urlStatics.revokeObjectURL };
    const createObjectURL = vi.fn(() => 'blob:users');
    urlStatics.createObjectURL = createObjectURL;
    urlStatics.revokeObjectURL = vi.fn();
    const clicked: string[] = [];
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function click(this: HTMLAnchorElement) { clicked.push(this.download); });

    try {
      const user = userEvent.setup();
      await mount();
      await screen.findByRole('button', { name: 'admin' });

      await user.click(screen.getByRole('button', { name: 'Export CSV' }));
      await user.click(screen.getByRole('button', { name: 'Export JSON' }));

      expect(clicked).toHaveLength(2);
      expect(clicked[0]).toMatch(/^users-\d{4}-\d{2}-\d{2}\.csv$/);
      expect(clicked[1]).toMatch(/^users-\d{4}-\d{2}-\d{2}\.json$/);
      expect(createObjectURL).toHaveBeenCalledTimes(2);
    } finally {
      clickSpy.mockRestore();
      urlStatics.createObjectURL = saved.create;
      urlStatics.revokeObjectURL = saved.revoke;
    }
  });

  it('Add New User opens the create editor via ?uid=0', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();

    await user.click(await screen.findByRole('button', { name: 'Add New User' }));
    expect(mockNavigate).toHaveBeenCalled();
    expect(mockSearch).toEqual({ uid: 0 });
  });

  it('clicking a username targets that row in the URL', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();

    await user.click(await screen.findByRole('button', { name: 'guest' }));
    expect(mockSearch).toEqual({ uid: 3 });
  });

  it('renders the create editor when ?uid=0 is already set', async () => {
    signIn();
    seed();
    mockSearch = { uid: 0 };
    await mount();
    expect(await screen.findByRole('dialog')).toHaveTextContent('Add User');
  });

  it('renders the 500 branch as an alert', async () => {
    signIn();
    seed([
      http.get('/api/v3/users', () =>
        HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'Users table locked' }, { status: 500 })),
    ]);
    await mount();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveAttribute('data-state', 'unreachable'));
  });

  it('renders a network failure as unreachable', async () => {
    signIn();
    seed([http.get('/api/v3/users', () => HttpResponse.error())]);
    await mount();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveAttribute('data-state', 'unreachable'));
  });

  it('read-only with only system View: list renders, no verbs, no mark column', async () => {
    signIn(VIEWER);
    seed();
    await mount();

    await waitFor(() => expect(screen.getByText('Site Admin')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Add New User' })).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    // Export stays available to a viewer.
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeInTheDocument();
    // Usernames are plain text without self-edit.
    expect(screen.queryByRole('button', { name: 'admin' })).toBeNull();
  });

  it('with ZM_USER_SELF_EDIT on, a viewer can still open their own row', async () => {
    signIn(VIEWER);
    seed([], '1');
    await mount();
    // uid 2 is `ops` — the signed-in viewer.
    expect(await screen.findByRole('button', { name: 'ops' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'guest' })).toBeNull();
  });

  it('without system View the whole page is a permission notice', async () => {
    signIn(OUTSIDER);
    seed();
    await mount();
    await waitFor(() =>
      expect(screen.getByText('You do not have permission to view this.')).toBeInTheDocument());
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('renders nothing when signed out', async () => {
    useAuthStore.setState({ accessToken: null, refreshToken: null, isAuthenticated: false, user: null });
    const { container } = await mount();
    expect(container).toBeEmptyDOMElement();
  });
});

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

// The editor target lives in `?uid=`; stand in for the router with an
// in-memory search object so navigate() re-renders the page.
const mockSearch: { uid?: number } = {};
let rerenderPage: (() => void) | null = null;
const mockNavigate = vi.fn((opts: { search?: (prev: Record<string, unknown>) => Record<string, unknown> }) => {
  const next = opts.search?.({ ...mockSearch }) ?? {};
  delete mockSearch.uid;
  if (typeof next.uid === 'number') mockSearch.uid = next.uid;
  rerenderPage?.();
});
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to?: string }) => (
    <a href={to ?? '#'} {...rest}>{children}</a>
  ),
  useSearch: () => ({ ...mockSearch }),
  useNavigate: () => mockNavigate,
}));

const { default: UsersPage } = await import('./settings.users');

function renderPage() {
  const r = renderWithProviders(<UsersPage />);
  rerenderPage = () => r.rerender(<UsersPage />);
  return r;
}

const server = setupServer();

beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test',
    refreshToken: 'test',
    user: { iat: 0, exp: 4102444800, user: 'admin', uid: 1 },
    isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'warn' });
});
afterEach(() => {
  server.resetHandlers();
  delete mockSearch.uid;
  rerenderPage = null;
});
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

const base = {
  control: 'None', groups: 'None', devices: 'None', snapshots: 'None',
  phone: '', language: '', home_view: '', max_bandwidth: '', api_enabled: 1,
};

function seedUsers() {
  server.use(
    http.get('/api/v3/users', () => HttpResponse.json({
      items: [
        { ...base, id: 1, username: 'admin', name: 'Administrator', email: 'admin@example.com',
          stream: 'View', events: 'Edit', monitors: 'Create', system: 'Edit', enabled: 1 },
        { ...base, id: 2, username: 'viewer', name: 'Viewer', email: 'v@example.com',
          stream: 'View', events: 'View', monitors: 'View', system: 'None', enabled: 0 },
      ],
      total: 2, per_page: 25, current_page: 1, last_page: 1,
    })),
  );
}

describe('Users page', () => {
  it('lists users and tags the signed-in one', async () => {
    seedUsers();
    renderPage();
    await waitFor(() => expect(screen.getByText('admin')).toBeInTheDocument());
    expect(screen.getByText('viewer')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByTitle('Cannot delete yourself')).toBeDisabled();
  });

  it('filters client-side by username, name or email', async () => {
    seedUsers();
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('admin')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText('Search users...'), 'v@example');
    expect(screen.queryByText('admin')).not.toBeInTheDocument();
    expect(screen.getByText('viewer')).toBeInTheDocument();
  });

  it('opens the editor on Add User with the Account form', async () => {
    seedUsers();
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('admin')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /add user/i }));
    await waitFor(() => expect(screen.getByText('Add User', { selector: 'h2, h3, h4, div, span' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /create user/i })).toBeDisabled();
  });
});

describe('Users page — legacy list features', () => {
  it('shows the Control / Groups / Snapshots / Devices columns', async () => {
    seedUsers();
    renderPage();
    await waitFor(() => expect(screen.getByText('admin')).toBeInTheDocument());
    for (const col of ['Control', 'Groups', 'Snapshots', 'Devices']) {
      expect(screen.getByRole('columnheader', { name: col })).toBeInTheDocument();
    }
  });

  it('opens the editor for ?uid= on load and clears it on close', async () => {
    seedUsers();
    mockSearch.uid = 2;
    const user = userEvent.setup();
    renderPage();
    const dialog = await screen.findByRole('dialog', { name: /edit viewer/i });
    expect(within(dialog).getByPlaceholderText('user@example.com')).toHaveValue('v@example.com');
    await user.click(within(dialog).getByRole('button', { name: /^cancel$/i }));
    await waitFor(() => expect(mockSearch.uid).toBeUndefined());
  });

  it('sends you to the self-service password form when editing your own row', async () => {
    seedUsers();
    mockSearch.uid = 1;
    const user = userEvent.setup();
    renderPage();

    const editor = await screen.findByRole('dialog', { name: /edit admin/i });
    // Your own password does not go through PUT /users/{id} at all, so the
    // dead password inputs are replaced by a route to PUT /me/password.
    expect(within(editor).queryByPlaceholderText('Not editable yet')).not.toBeInTheDocument();
    await user.click(within(editor).getByRole('button', { name: /change password/i }));

    // The editor closes first — no dialog stacked inside a dialog.
    await waitFor(() => expect(mockSearch.uid).toBeUndefined());
    const pw = await screen.findByRole('dialog', { name: 'Change password' });
    expect(within(pw).getByLabelText('Current password')).toBeInTheDocument();
  });

  it('offers no password form when editing somebody else', async () => {
    seedUsers();
    mockSearch.uid = 2;
    renderPage();

    const editor = await screen.findByRole('dialog', { name: /edit viewer/i });
    expect(within(editor).queryByRole('button', { name: /change password/i })).not.toBeInTheDocument();
    expect(within(editor).getByPlaceholderText('Not editable yet')).toBeDisabled();
  });

  it('marks rows and bulk-deletes them, never the signed-in user', async () => {
    seedUsers();
    const deleted: string[] = [];
    server.use(http.delete('/api/v3/users/:id', ({ params }) => {
      deleted.push(String(params.id));
      return new HttpResponse(null, { status: 204 });
    }));
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('viewer')).toBeInTheDocument());

    expect(screen.getByRole('checkbox', { name: 'Mark admin' })).toBeDisabled();
    const bulk = screen.getByRole('button', { name: /delete selected/i });
    expect(bulk).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    expect(screen.getByRole('checkbox', { name: 'Mark viewer' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: /delete selected \(1\)/i }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^delete$/i }));
    await waitFor(() => expect(deleted).toEqual(['2']));
  });

  it('exports the matching rows as CSV', async () => {
    seedUsers();
    // jsdom has no object URLs; patch just those two statics (MSW needs the rest of URL).
    const createObjectURL = vi.fn<(b: Blob) => string>(() => 'blob:x');
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('viewer')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /export csv/i }));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0];
    expect(await blob.text()).toMatch(/^id,username,name,email,enabled/);
    expect(click).toHaveBeenCalled();
  });
});

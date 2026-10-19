/**
 * Classic top navigation: the legacy navbar's item list, its `canView()`
 * gating, the active-page marker and the log-out verb.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import type { UserClaims, UserPerms } from '@/types';

let pathname = '/';
const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ pathname }),
  useNavigate: () => mockNavigate,
  Link: ({ children, to, ...rest }: { children: ReactNode; to?: string; [k: string]: unknown }) => (
    <a href={to ?? '#'} {...rest}>{children}</a>
  ),
}));

const { ClassicTopNav } = await import('./TopNav');

const ALL_EDIT: UserPerms = {
  stream: 'Edit', events: 'Edit', control: 'Edit', monitors: 'Edit',
  groups: 'Edit', devices: 'Edit', snapshots: 'Edit', system: 'Edit',
};

function signIn(perms?: Partial<UserPerms>, name = 'admin') {
  useAuthStore.setState({
    accessToken: 't',
    refreshToken: 't',
    isAuthenticated: true,
    user: { iat: 0, exp: 0, user: name, perms: { ...ALL_EDIT, ...perms } } as unknown as UserClaims,
  });
}

let logoutCalls = 0;
/** `logState()` counts one `GET /logs` per severity; `page_size:1` reads `total`. */
let logTotals: Record<string, number> = {};
function configRows(overrides: Record<string, string> = {}) {
  return Object.entries({ ZM_HOME_ABOUT: '0', ...overrides }).map(([name, value], i) => ({
    id: i + 1, name, value, type: 'string', category: 'web', readonly: 0, private: 0, system: 0,
  }));
}
let configOverrides: Record<string, string> = {};
let states: Array<{ id: number; name: string; is_active: number }> = [];

const server = setupServer(
  http.get('/api/v3/system/status', () => HttpResponse.json({ running: true, daemons: [] })),
  http.get('/api/v3/states', () => HttpResponse.json({
    items: states.map((st) => ({ ...st, definition: '' })),
    total: states.length, per_page: 200, current_page: 1, last_page: 1,
  })),
  http.get('/api/v3/auth/logout', () => { logoutCalls += 1; return new HttpResponse(null, { status: 204 }); }),
  http.get('/api/v3/me', () => HttpResponse.json({ kind: 'NOT_FOUND' }, { status: 404 })),
  http.get('/api/v3/configs', () => HttpResponse.json({
    items: configRows(configOverrides), total: 1, per_page: 1000, current_page: 1, last_page: 1,
  })),
  http.get('/api/v3/logs', ({ request }) => {
    const level = new URL(request.url).searchParams.get('level') ?? '';
    return HttpResponse.json({
      items: [], total: logTotals[level] ?? 0, per_page: 1, current_page: 1, last_page: 1,
    });
  }),
);
beforeAll(() => { server.listen({ onUnhandledRequest: 'error' }); });
afterEach(() => {
  server.resetHandlers();
  pathname = '/';
  logoutCalls = 0;
  states = [];
  mockNavigate.mockReset();
  logTotals = {};
  configOverrides = {};
  useUiStore.setState({ classicStatBarOpen: true });
  useAuthStore.getState().clearAuth();
});
afterAll(() => { server.close(); });

const navNames = () =>
  within(screen.getByRole('navigation', { name: 'Main' }))
    .getAllByRole('link')
    .map((a) => a.textContent);

describe('ClassicTopNav', () => {
  it('lists the legacy items in the legacy order for a full-access user', () => {
    signIn();
    renderWithProviders(<ClassicTopNav />);
    expect(navNames()).toEqual([
      'Console', 'Cycle', 'Montage', 'Montage Review', 'Events',
      'Options', 'Log', 'Groups', 'Filters', 'Reports', 'Audit Events Report',
    ]);
  });

  it('points each item at its route', () => {
    signIn();
    renderWithProviders(<ClassicTopNav />);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Console' })).toHaveAttribute('href', '/');
    expect(within(nav).getByRole('link', { name: 'Montage Review' })).toHaveAttribute('href', '/montagereview');
    expect(within(nav).getByRole('link', { name: 'Audit Events Report' })).toHaveAttribute('href', '/audit');
  });

  it('shows the signed-in user as the account link that opens the logout modal', async () => {
    signIn(undefined, 'operator');
    renderWithProviders(<ClassicTopNav />);
    // No stand-alone log-out verb with builtin auth: legacy logs out from the modal.
    expect(screen.queryByRole('button', { name: 'Log out' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'operator' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText("Current login is 'operator'")).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Logout' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('lists the other logged-in PHP sessions for a System viewer, decoded from the Sessions rows', async () => {
    signIn(undefined, 'admin');
    server.use(http.get('/api/v3/sessions', () => HttpResponse.json({
      items: [
        { id: 'a', access: Math.floor(Date.now() / 1000) - 30, data: 'remoteAddr|s:12:"192.168.0.10";username|s:3:"bob";user|a:1:{s:2:"Id";i:7;}' },
        { id: 'b', access: Math.floor(Date.now() / 1000) - 10, data: 'username|s:3:"eve";last_time|i:1;' },
      ],
      total: 2, per_page: 100, current_page: 1, last_page: 1,
    })));
    renderWithProviders(<ClassicTopNav />);
    await userEvent.click(screen.getByRole('button', { name: 'admin' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Other logged in users:')).toBeInTheDocument();
    const bob = await within(dialog).findByRole('link', { name: 'bob' });
    // The router is stubbed here; the route's `uid` search param is validated in its own test.
    expect(bob).toHaveAttribute('href', '/settings/users');
    expect(within(dialog).getByText('192.168.0.10')).toBeInTheDocument();
    // A session with `last_time` is dead and left out.
    expect(within(dialog).queryByText('eve')).toBeNull();
  });

  it('hides the sessions table and the Config button when neither applies', async () => {
    signIn({ system: 'None' } as Partial<UserPerms>, 'viewer');
    renderWithProviders(<ClassicTopNav />);
    await userEvent.click(screen.getByRole('button', { name: 'viewer' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText('Other logged in users:')).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Config' })).toBeNull();
  });

  it('offers Config to the own user page when ZM_USER_SELF_EDIT is on', async () => {
    signIn(undefined, 'admin');
    server.use(http.get('/api/v3/configs', () => HttpResponse.json({
      items: [{ id: 1, name: 'ZM_USER_SELF_EDIT', value: '1', type: 'boolean', category: 'system', readonly: 0, private: 0, system: 0, source: 'db' }],
      total: 1, per_page: 1000, current_page: 1, last_page: 1,
    })));
    renderWithProviders(<ClassicTopNav />);
    await userEvent.click(screen.getByRole('button', { name: 'admin' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Config' }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({ to: '/settings/users' })));
  });

  it('omits the user chip when the token carries no name', () => {
    useAuthStore.setState({
      accessToken: 't', refreshToken: 't', isAuthenticated: true,
      user: { iat: 0, exp: 0, perms: ALL_EDIT } as unknown as UserClaims,
    });
    renderWithProviders(<ClassicTopNav />);
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
    expect(screen.queryByText('admin')).toBeNull();
  });

  it('hides the stream pages from a user without stream View', () => {
    signIn({ stream: 'None' });
    renderWithProviders(<ClassicTopNav />);
    const names = navNames();
    expect(names).not.toContain('Cycle');
    expect(names).not.toContain('Montage');
    expect(names).not.toContain('Montage Review');
    expect(names).toContain('Console');
    expect(names).toContain('Events');
  });

  it('hides every events page from a user without events View', () => {
    signIn({ events: 'None' });
    renderWithProviders(<ClassicTopNav />);
    const names = navNames();
    for (const hidden of ['Events', 'Filters', 'Reports', 'Audit Events Report']) {
      expect(names).not.toContain(hidden);
    }
  });

  it('hides Options, Log and the run-state toggle without system View', async () => {
    signIn({ system: 'None' });
    renderWithProviders(<ClassicTopNav />);
    const names = navNames();
    expect(names).not.toContain('Options');
    expect(names).not.toContain('Log');
    expect(names).toContain('Groups');
    await waitFor(() => expect(screen.queryByRole('button', { name: /Run state/ })).toBeNull());
  });

  it('hides Groups from a user without groups View', () => {
    signIn({ groups: 'None' });
    renderWithProviders(<ClassicTopNav />);
    expect(navNames()).not.toContain('Groups');
  });

  it('offers the run-state toggle to a system editor', async () => {
    signIn();
    renderWithProviders(<ClassicTopNav />);
    expect(await screen.findByRole('button', { name: 'Run state: Running. Change run state' })).toBeInTheDocument();
  });

  it('names the active saved state on the button, as legacy runtimeStatus() does', async () => {
    states = [{ id: 1, name: 'default', is_active: 0 }, { id: 2, name: 'Away', is_active: 1 }];
    signIn();
    renderWithProviders(<ClassicTopNav />);
    expect(await screen.findByRole('button', { name: 'Run state: Away. Change run state' })).toHaveTextContent('Away');
  });

  it('reads Running, not "default", while the default state is active', async () => {
    states = [{ id: 1, name: 'default', is_active: 1 }];
    signIn();
    renderWithProviders(<ClassicTopNav />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^Run state:/ })).toHaveTextContent('Running'));
  });

  it('shows the status as text, with no button, to a System View user', async () => {
    signIn({ system: 'View' });
    renderWithProviders(<ClassicTopNav />);
    await waitFor(() => expect(screen.getByTestId('classic-run-state')).toHaveTextContent('Running'));
    expect(screen.queryByRole('button', { name: /Run state/ })).toBeNull();
  });

  it('marks only the current page with aria-current', () => {
    pathname = '/events/28876';
    signIn();
    renderWithProviders(<ClassicTopNav />);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Events' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Console' })).not.toHaveAttribute('aria-current');
  });

  it('marks Console current only on the root path, not on every route', () => {
    pathname = '/';
    signIn();
    const { unmount } = renderWithProviders(<ClassicTopNav />);
    expect(within(screen.getByRole('navigation', { name: 'Main' }))
      .getByRole('link', { name: 'Console' })).toHaveAttribute('aria-current', 'page');
    unmount();

    pathname = '/logs';
    renderWithProviders(<ClassicTopNav />);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Console' })).not.toHaveAttribute('aria-current');
    expect(within(nav).getByRole('link', { name: 'Log' })).toHaveAttribute('aria-current', 'page');
  });

  it('calls the backend, clears the session and routes to /login on log out', async () => {
    signIn();
    renderWithProviders(<ClassicTopNav />);
    await userEvent.click(screen.getByRole('button', { name: 'admin' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Logout' }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/login' }));
    expect(logoutCalls).toBe(1);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('still clears the session when the logout request fails', async () => {
    signIn();
    server.use(http.get('/api/v3/auth/logout', () => HttpResponse.error()));
    renderWithProviders(<ClassicTopNav />);
    await userEvent.click(screen.getByRole('button', { name: 'admin' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Logout' }));

    await waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(false));
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/login' });
  });
});

describe('ClassicTopNav — brand, flip and log state', () => {
  it('links the brand to ZM_HOME_URL when ZM_HOME_ABOUT is off', async () => {
    configOverrides = { ZM_HOME_URL: 'https://example.test/', ZM_HOME_CONTENT: 'My ZM' };
    signIn();
    renderWithProviders(<ClassicTopNav />);
    const brand = await screen.findByRole('link', { name: 'My ZM' });
    expect(brand).toHaveAttribute('href', 'https://example.test/');
  });

  it('opens the about dropdown with ZM_HOME_ABOUT on', async () => {
    const user = userEvent.setup();
    configOverrides = { ZM_HOME_ABOUT: '1' };
    signIn();
    renderWithProviders(<ClassicTopNav />);
    const brand = await screen.findByRole('button', { name: 'ZoneMinder' });
    await user.click(brand);
    const menu = screen.getByRole('menu', { name: 'About ZoneMinder' });
    expect(within(menu).getAllByRole('menuitem').map((a) => a.textContent))
      .toEqual(['ZoneMinder', 'Documentation', 'Support']);
    expect(within(menu).getByRole('menuitem', { name: 'Documentation' }))
      .toHaveAttribute('href', 'https://zoneminder.readthedocs.io/en/stable/');
  });

  it('flips the stat strip and remembers the choice', async () => {
    const user = userEvent.setup();
    signIn();
    renderWithProviders(<ClassicTopNav />);
    await user.click(screen.getByRole('button', { name: 'Hide server stats' }));
    expect(useUiStore.getState().classicStatBarOpen).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Show server stats' }));
    expect(useUiStore.getState().classicStatBarOpen).toBe(true);
  });

  it('greens the Log item while the log is quiet and reddens it at the alarm count', async () => {
    signIn();
    const view = renderWithProviders(<ClassicTopNav />);
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Log' })).toHaveAttribute('data-log-state', 'ok'));
    view.unmount();

    // One FATAL row is ZoneMinder's default alarm threshold.
    logTotals = { '-3': 1 };
    renderWithProviders(<ClassicTopNav />);
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Log' })).toHaveAttribute('data-log-state', 'alarm'));
  });
});

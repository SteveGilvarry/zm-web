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

const server = setupServer(
  http.get('/api/v3/system/status', () => HttpResponse.json({ running: true, daemons: [] })),
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

  it('shows the signed-in user and a log-out verb', () => {
    signIn(undefined, 'operator');
    renderWithProviders(<ClassicTopNav />);
    expect(screen.getByText('operator')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
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
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/login' }));
    expect(logoutCalls).toBe(1);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('still clears the session when the logout request fails', async () => {
    signIn();
    server.use(http.get('/api/v3/auth/logout', () => HttpResponse.error()));
    renderWithProviders(<ClassicTopNav />);
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));

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

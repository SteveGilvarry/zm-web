/**
 * Options → API (classic skin), legacy `_options_api.php`: the three-column
 * token table, Update writing `api_enabled` / `token_min_expiry`, Revoke All
 * stamping every user, and the "APIs are disabled" notice.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import { renderWithProviders } from '@/test/render';
import { configListHandler } from '@/test/msw/handlers';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/components/common/toastStore';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: ReactNode; to?: string; search?: unknown }) => {
    delete rest.search;
    return <a href={to ?? '#'} {...rest}>{children}</a>;
  },
  useSearch: () => ({}),
  useNavigate: () => vi.fn(),
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
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', isAuthenticated: true, user: user as never,
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

const mkUser = (over: Record<string, unknown>) => ({
  id: 0, username: '', name: '', email: '', phone: '', enabled: 1, api_enabled: 0,
  home_view: 'console', stream: 'View', events: 'View', control: 'None', monitors: 'None',
  groups: 'None', devices: 'None', snapshots: 'None', system: 'None',
  ...over,
});

const USERS = [
  mkUser({ id: 2, username: 'ops', api_enabled: 0 }),
  mkUser({ id: 1, username: 'admin', api_enabled: 1, system: 'Edit' }),
];

let sent: Array<{ id: string; body: Record<string, unknown> }> = [];

function seed(useApi = '1') {
  sent = [];
  server.use(
    http.get('/api/v3/configs/categories', () => HttpResponse.json([{ category: 'system', count: 1 }])),
    configListHandler({ ZM_OPT_USE_API: useApi }),
    http.get('/api/v3/users', () =>
      HttpResponse.json({ items: USERS, total: USERS.length, per_page: 1000, current_page: 1, last_page: 1 })),
    http.put('/api/v3/users/:id', async ({ request, params }) => {
      sent.push({ id: String(params.id), body: (await request.json()) as Record<string, unknown> });
      return HttpResponse.json(USERS[0]);
    }),
  );
}

async function mount() {
  const { default: Page } = await import('./settings.apiTokens');
  return renderWithProviders(<Page />);
}

describe('ClassicSettingsApiTokensPage', () => {
  it('lists users alphabetically with the legacy columns and current API state', async () => {
    signIn();
    seed();
    await mount();

    expect(await screen.findByText('admin')).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent))
      .toEqual(['Username', 'Revoke Token', 'API Enabled']);
    // Sorted by username, not by the order the API returned them.
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual(['admin', 'ops']);
    expect(screen.getByRole('checkbox', { name: 'API enabled for admin' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'API enabled for ops' })).not.toBeChecked();
  });

  it('Update writes only the rows that changed', async () => {
    signIn();
    seed();
    await mount();
    const user = userEvent.setup();

    await screen.findByText('admin');
    const update = screen.getByRole('button', { name: 'Update' });
    expect(update).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: 'API enabled for ops' }));
    await user.click(screen.getByRole('checkbox', { name: 'Revoke tokens for admin' }));
    expect(update).toBeEnabled();
    await user.click(update);

    await waitFor(() => expect(sent).toHaveLength(2));
    const ops = sent.find((r) => r.id === '2')!;
    expect(ops.body).toEqual({ api_enabled: 1 });
    // admin's API state did not change, so only the revocation floor is sent.
    const admin = sent.find((r) => r.id === '1')!;
    expect(Object.keys(admin.body)).toEqual(['token_min_expiry']);
    expect(admin.body.token_min_expiry).toBeCloseTo(Math.floor(Date.now() / 1000), -1);
  });

  it('Cancel drops the draft without writing anything', async () => {
    signIn();
    seed();
    await mount();
    const user = userEvent.setup();

    await screen.findByText('admin');
    await user.click(screen.getByRole('checkbox', { name: 'API enabled for ops' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('checkbox', { name: 'API enabled for ops' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Update' })).toBeDisabled();
    expect(sent).toHaveLength(0);
  });

  it('Revoke All Tokens confirms, then stamps every user', async () => {
    signIn();
    seed();
    await mount();
    const user = userEvent.setup();

    await screen.findByText('admin');
    await user.click(screen.getByRole('button', { name: 'Revoke All Tokens' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Revoke All Tokens' }));

    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent.map((r) => r.id).sort()).toEqual(['1', '2']);
    for (const call of sent) expect(Object.keys(call.body)).toEqual(['token_min_expiry']);
  });

  it('says so when ZM_OPT_USE_API is off, and offers no controls', async () => {
    signIn();
    seed('0');
    await mount();

    expect(await screen.findByRole('alert')).toHaveTextContent(/APIs are disabled/);
    expect(screen.queryByRole('button', { name: 'Update' })).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows the table read-only without System Edit', async () => {
    signIn(VIEWER);
    seed();
    await mount();

    expect(await screen.findByText('admin')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'API enabled for admin' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Update' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Revoke All Tokens' })).toBeNull();
  });
});

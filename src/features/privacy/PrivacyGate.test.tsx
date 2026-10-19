/**
 * The privacy statement (`privacy.php`, `index.php:274`): asked of System
 * Edit users while ZM_SHOW_PRIVACY is on, not on Options or login, once.
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
import { useUiStore } from '@/stores/ui';
import { useToastStore } from '@/components/common/toastStore';
import { PrivacyGate } from './PrivacyGate';

let mockPath = '/';
const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: ReactNode; to?: string; search?: unknown }) => {
    delete rest.search;
    return <a href={to ?? '#'} {...rest}>{children}</a>;
  },
  useLocation: () => ({ pathname: mockPath }),
  useNavigate: () => mockNavigate,
  useSearch: () => ({}),
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
const signIn = (user: unknown = ADMIN) =>
  useAuthStore.setState({ accessToken: 't', refreshToken: 't', isAuthenticated: true, user: user as never });

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  useToastStore.getState().clear();
  mockNavigate.mockClear();
  mockPath = '/';
  useUiStore.getState().setSkin('modern');
});
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

let answers: unknown[] = [];
function seed(show = '1', telemetry = '0') {
  answers = [];
  server.use(
    http.get('/api/v3/me', () => HttpResponse.json({}, { status: 404 })),
    configListHandler({ ZM_SHOW_PRIVACY: show, ZM_TELEMETRY_DATA: telemetry }),
    http.post('/api/v3/system/privacy', async ({ request }) => {
      const body = (await request.json()) as { accept: boolean };
      answers.push(body);
      // The backend turns the flag off, so the refetch agrees.
      server.use(configListHandler({ ZM_SHOW_PRIVACY: '0', ZM_TELEMETRY_DATA: body.accept ? '1' : '0' }));
      return HttpResponse.json({ show_privacy: false, telemetry: body.accept });
    }),
  );
}

describe('PrivacyGate', () => {
  it('modern: a dialog only an answer closes; Accept posts and it goes away for good', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    renderWithProviders(<PrivacyGate />);
    const dialog = await screen.findByRole('alertdialog', { name: 'Privacy' });
    expect(dialog).toHaveTextContent('The ZoneMinder Telemetry daemon collects the following data');
    expect(within(dialog).getByRole('link', { name: 'ipinfo.io' })).toHaveAttribute('href', 'https://ipinfo.io/geo');
    expect(within(dialog).getByText('Telemetry is off now.')).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Accept' })).toHaveFocus());

    await user.keyboard('{Escape}');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(answers).toEqual([{ accept: true }]));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    // The gate does not navigate; legacy's home-view redirect is for the page.
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('modern: Decline posts accept=false', async () => {
    signIn();
    seed('1', '1');
    const user = userEvent.setup();
    renderWithProviders(<PrivacyGate />);
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Telemetry is on now.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Decline' }));
    await waitFor(() => expect(answers).toEqual([{ accept: false }]));
  });

  it('classic: privacy.php — the select starts on the current telemetry value, Apply sends it', async () => {
    useUiStore.getState().setSkin('classic');
    signIn();
    seed('1', '1');
    const user = userEvent.setup();
    renderWithProviders(<PrivacyGate />);
    const page = await screen.findByRole('dialog', { name: 'Privacy' });
    expect(within(page).getByRole('heading', { name: 'ZoneMinder - Privacy' })).toBeInTheDocument();
    const select = within(page).getByRole('combobox', { name: 'Privacy' });
    expect(select).toHaveValue('1');
    expect([...(select as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(['Accept', 'Decline']);
    await user.selectOptions(select, '0');
    await user.click(within(page).getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(answers).toEqual([{ accept: false }]));
  });

  it.each([
    ['the flag is off', () => seed('0'), ADMIN, '/'],
    ['the user lacks System Edit', () => seed('1'), VIEWER, '/'],
    ['on an Options page', () => seed('1'), ADMIN, '/settings/users'],
    ['on Options itself', () => seed('1'), ADMIN, '/settings'],
    ['on the login page', () => seed('1'), ADMIN, '/login'],
  ])('stays hidden when %s', async (_why, setup, who, path) => {
    signIn(who);
    setup();
    mockPath = path;
    const { queryClient } = renderWithProviders(<PrivacyGate />);
    await waitFor(() => expect(queryClient.getQueryData(['configs', 'lookup'])).toBeDefined());
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

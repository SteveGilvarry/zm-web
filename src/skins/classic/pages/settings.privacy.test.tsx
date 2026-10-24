/** Options → Privacy as a page, both skins: answer, then legacy's redirect home. */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw/http';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { configListHandler } from '@/test/msw/handlers';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/components/common/toastStore';

const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to?: string }) => <a href={to ?? '#'}>{children}</a>,
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
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  server.resetHandlers();
  useToastStore.getState().clear();
  mockNavigate.mockClear();
});
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

let answers: unknown[] = [];
function seed() {
  answers = [];
  server.use(
    http.get('/api/v3/me', () => HttpResponse.json({}, { status: 404 })),
    configListHandler({ ZM_SHOW_PRIVACY: '0', ZM_TELEMETRY_DATA: '0' }),
    http.post('/api/v3/system/privacy', async ({ request }) => {
      answers.push(await request.json());
      return HttpResponse.json({ show_privacy: false, telemetry: true });
    }),
  );
}

describe('Privacy page', () => {
  it('classic: Apply sends the choice and goes to the home view', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    const { default: Page } = await import('./settings.privacy');
    renderWithProviders(<Page variant="page" />);
    expect(await screen.findByRole('heading', { name: 'ZoneMinder - Privacy' })).toBeInTheDocument();
    // Telemetry is off, so the select starts on Decline.
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Privacy' })).toHaveValue('0'));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Privacy' }), '1');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(answers).toEqual([{ accept: true }]));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/' }));
  });

  it('classic: without System Edit it is a permission notice', async () => {
    signIn(VIEWER);
    seed();
    const { default: Page } = await import('./settings.privacy');
    renderWithProviders(<Page variant="page" />);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull());
  });

  it('modern: Accept / Decline on a page, then home', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    const { default: Page } = await import('../../modern/pages/settings.privacy');
    renderWithProviders(<Page variant="page" />);
    await user.click(await screen.findByRole('button', { name: 'Decline' }));
    await waitFor(() => expect(answers).toEqual([{ accept: false }]));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/' }));
  });
});

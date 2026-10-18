/**
 * The modern sidebar's Log item carries legacy's `logState()` as a small
 * state mark: none while the log is quiet, warn at the alert counts, danger
 * at the alarm counts.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import type { UserClaims } from '@/types';

vi.mock('@tanstack/react-router', () => ({
  useRouterState: () => ({ location: { pathname: '/' } }),
  useNavigate: () => vi.fn(),
  Link: ({ children, to, ...rest }: { children: ReactNode; to?: string; [k: string]: unknown }) => (
    <a href={to ?? '#'} {...rest}>{children}</a>
  ),
}));

const { Sidebar } = await import('./Sidebar');

let logTotals: Record<string, number> = {};
const server = setupServer(
  http.get('/api/v3/logs', ({ request }) => {
    const level = new URL(request.url).searchParams.get('level') ?? '';
    return HttpResponse.json({ items: [], total: logTotals[level] ?? 0, per_page: 1, current_page: 1, last_page: 1 });
  }),
  http.get('/api/v3/configs', () => HttpResponse.json({ items: [], total: 0, per_page: 1000, current_page: 1, last_page: 1 })),
  http.get('/api/v3/me', () => HttpResponse.json({ kind: 'NOT_FOUND' }, { status: 404 })),
);
beforeAll(() => {
  // jsdom has no matchMedia; the sidebar asks whether it is on a desktop.
  window.matchMedia = ((query: string) => ({
    matches: true, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  useAuthStore.setState({
    accessToken: 't', refreshToken: 't', isAuthenticated: true,
    user: { iat: 0, exp: 0, user: 'admin', perms: { system: 'View' } } as unknown as UserClaims,
  });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => { server.resetHandlers(); logTotals = {}; });
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

describe('Sidebar — Log state', () => {
  it('shows no mark while the log is quiet', async () => {
    renderWithProviders(<Sidebar />);
    await screen.findByRole('link', { name: 'Log' });
    // Give the four count queries time to land.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('nav-state-/logs')).toBeNull();
  });

  it('marks the Log item danger at the alarm counts (one FATAL by default)', async () => {
    logTotals = { '-3': 1 };
    renderWithProviders(<Sidebar />);
    await waitFor(() => expect(screen.getByTestId('nav-state-/logs')).toHaveClass('bg-danger'));
    expect(screen.getByRole('img', { name: 'Log has errors' })).toBeInTheDocument();
  });

  it('marks it warn at the alert counts (one ERROR by default)', async () => {
    logTotals = { '-2': 1 };
    renderWithProviders(<Sidebar />);
    await waitFor(() => expect(screen.getByTestId('nav-state-/logs')).toHaveClass('bg-warn'));
  });
});

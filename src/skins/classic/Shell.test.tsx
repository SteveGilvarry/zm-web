/**
 * The classic skin's shell: top nav + stat strip + backend banner wrapped
 * around the page, with the toast viewport mounted last.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import { toast, useToastStore } from '@/components/common/toastStore';
import type { UserClaims } from '@/types';

vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ pathname: '/' }),
  useNavigate: () => vi.fn(),
  Link: ({ children, to, ...rest }: { children: ReactNode; to?: string; [k: string]: unknown }) => (
    <a href={to ?? '#'} {...rest}>{children}</a>
  ),
}));

const { ClassicShell } = await import('./Shell');

const server = setupServer(
  http.get('/api/v3/system/status', () => HttpResponse.json({
    running: true,
    daemons: [],
    stats: {
      cpu_load: 0.4, cpu_usage_percent: 12,
      total_mem: 16e9, free_mem: 8e9,
      total_swap: 0, free_swap: 0,
      total_disk: 1e12, used_disk: 5e11, free_disk: 5e11, disk_usage_percent: 50,
    },
  })),
  http.get('/api/v3/host/getVersion', () => HttpResponse.json({ version: '1.37.0', api_version: '3.0' })),
);

beforeAll(() => {
  useAuthStore.setState({
    accessToken: 't', refreshToken: 't', isAuthenticated: true,
    user: { iat: 0, exp: 0, user: 'admin' } as unknown as UserClaims,
  });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => { server.resetHandlers(); useToastStore.getState().clear(); });
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

describe('ClassicShell', () => {
  it('wraps the page in the legacy nav and stat strip', async () => {
    renderWithProviders(
      <ClassicShell title="Console"><p>page body</p></ClassicShell>,
    );

    expect(screen.getByText('page body')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    // The stat strip fills in once /system/status and /host/getVersion answer.
    await waitFor(() => expect(screen.getByText('v1.37.0')).toBeInTheDocument());
    expect(screen.getByText('Load: 0.40')).toBeInTheDocument();
    expect(screen.getByText('Memory: 50%')).toBeInTheDocument();
  });

  it('renders toasts raised while a page is mounted', async () => {
    renderWithProviders(<ClassicShell><p>page body</p></ClassicShell>);

    act(() => { toast.success('Saved'); });
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });
});

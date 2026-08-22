/**
 * The uptime readout rolls up through four units. The existing suite only
 * reaches seconds and minutes; these cover the hour and day formats, which is
 * what an operator actually sees on a box that has been up for a while.
 */
import { describe, expect, it, vi, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import type { DaemonStatus } from '@/types';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to?: string }) => (
    <a href={to ?? '#'} {...rest}>{children}</a>
  ),
}));

const { SystemStatus } = await import('./SystemStatus');

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({ accessToken: 't', refreshToken: 't', user: null, isAuthenticated: true });
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  server.use(http.get('/api/v3/host/getVersion', () =>
    HttpResponse.json({ version: '1.36.34', api_version: '3', db_version: 'x' })));
});
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

const daemon = (uptime: number): DaemonStatus => ({
  id: 'zmc', name: 'zmc', state: 'running', pid: 1, uptime_seconds: uptime,
} as DaemonStatus);

describe('SystemStatus — uptime formatting', () => {
  it('shows hours and minutes for an uptime under a day', () => {
    renderWithProviders(<SystemStatus daemons={[daemon(3 * 3600 + 25 * 60)]} isRunning />);
    expect(screen.getByText('3h 25m')).toBeInTheDocument();
  });

  it('shows days and hours once the box has been up longer', () => {
    renderWithProviders(<SystemStatus daemons={[daemon(9 * 86400 + 4 * 3600 + 30 * 60)]} isRunning />);
    expect(screen.getByText('9d 4h')).toBeInTheDocument();
  });

  it('takes the longest-running daemon as the system uptime', () => {
    renderWithProviders(
      <SystemStatus daemons={[daemon(120), daemon(2 * 86400), daemon(45)]} isRunning />,
    );
    expect(screen.getByText('2d 0h')).toBeInTheDocument();
  });

  it('hides the uptime row entirely when no daemon reports one', () => {
    renderWithProviders(<SystemStatus daemons={[daemon(0)]} isRunning />);
    expect(screen.queryByText('Uptime')).toBeNull();
  });
});

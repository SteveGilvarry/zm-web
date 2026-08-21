/**
 * Integration tests for the classic-skin log viewer. Same harness as the
 * classic audit test; the hook reads filters from `useSearch` and writes
 * them through `useNavigate`, so both are shimmed.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import type { LogsSearchParams } from '@/features/logs/useLogsPage';

let mockSearch: LogsSearchParams = {};
const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to?: string; [k: string]: unknown }) => (
    <a href={to ?? '#'} {...rest}>{children}</a>
  ),
  useSearch: () => mockSearch,
  useNavigate: () => mockNavigate,
}));

vi.mock('@/skins/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const server = setupServer();
beforeAll(() => {
  // A token without a `perms` claim reads as Edit on every feature, so the
  // system-Edit gate around Clear Logs opens.
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test',
    user: { iat: 0, exp: 0, user: 'admin' }, isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  server.resetHandlers();
  mockSearch = {};
  mockNavigate.mockReset();
  window.localStorage.clear();
});
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

async function mount() {
  const { default: Page } = await import('./logs');
  return renderWithProviders(<Page />);
}

// ZoneMinder levels as the live box writes them: -2 ERR, -1 WAR, 0 INF.
const logs = [
  { id: 1, time_key: '1780000000', component: 'zmc_m1', pid: 10, level: -2, code: 'ERR', message: 'Failed to capture image', file: 'zmc.cpp', line: 333, server_id: null },
  { id: 2, time_key: '1780000001', component: 'zmc_m3', pid: 11, level: -1, code: 'WAR', message: 'MQTT connect returns 14', file: 'zm_mqtt.cpp', line: 34, server_id: null },
  { id: 3, time_key: '1780000002', component: 'zmc_m4', pid: 12, level: 0, code: 'INF', message: 'Unable to read packet', file: 'zm_ffmpeg_camera.cpp', line: 184, server_id: null },
];

function stub() {
  server.use(
    http.get('/api/v3/logs', () =>
      HttpResponse.json({ items: logs, total: 3, per_page: 50, current_page: 1, last_page: 1 }),
    ),
    http.get('/api/v3/servers', () =>
      HttpResponse.json({ items: [], total: 0, per_page: 100, current_page: 1, last_page: 1 }),
    ),
    // `useDateTimeFormat` reads ZM's four date/time rows; blank = locale default.
    http.get('/api/v3/configs/:name', ({ params }) =>
      HttpResponse.json({ name: String(params.name), value: '' })),
  );
}

describe('LogsPage — classic skin', () => {
  it('renders the legacy seven-column table', async () => {
    stub();
    await mount();
    await waitFor(() => expect(screen.getByText('Failed to capture image')).toBeInTheDocument());

    const headers = within(screen.getByTestId('log-table'))
      .getAllByRole('columnheader')
      .map((th) => th.textContent);
    // Date/Time carries the sort control, hence the arrow glyph.
    expect(headers).toEqual(['Date/Time▼', 'Component', 'PID', 'Level', 'Message', 'File', 'Line']);
    expect(within(screen.getByTestId('log-table')).getAllByRole('columnheader')[0])
      .toHaveAttribute('aria-sort', 'descending');

    const row = screen.getByTestId('log-row-1');
    expect(within(row).getByText('zmc.cpp')).toBeInTheDocument();
    expect(within(row).getByText('333')).toBeInTheDocument();
    expect(within(row).getByText('ERR')).toBeInTheDocument();
  });

  it('bands rows by severity like legacy', async () => {
    stub();
    await mount();
    await waitFor(() => expect(screen.getByTestId('log-row-1')).toBeInTheDocument());

    expect(screen.getByTestId('log-row-1').className).toContain('bg-[#f8d7da]');
    expect(screen.getByTestId('log-row-2').className).toContain('bg-[#fff3cd]');
    expect(screen.getByTestId('log-row-3').className).not.toContain('bg-[#f8d7da]');
    expect(screen.getByTestId('log-row-3').className).not.toContain('bg-[#fff3cd]');
  });

  it('offers Clear Logs behind a confirmation that names the scope', async () => {
    stub();
    const user = userEvent.setup();
    await mount();
    await waitFor(() => expect(screen.getByTestId('log-row-1')).toBeInTheDocument());

    const clear = screen.getByRole('button', { name: /clear logs/i });
    expect(clear).toBeEnabled();

    await user.click(clear);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/every row in the log table/)).toBeInTheDocument();
  });

  it('offers the legacy filter fields and the status line', async () => {
    stub();
    await mount();
    await waitFor(() => expect(screen.getByTestId('log-row-1')).toBeInTheDocument());

    expect(screen.getByLabelText('Component')).toBeInTheDocument();
    expect(screen.getByLabelText('Level')).toBeInTheDocument();
    expect(screen.getByLabelText('Start Date/Time')).toBeInTheDocument();
    expect(screen.getByLabelText('End Date/Time')).toBeInTheDocument();
    expect(screen.getByTestId('log-status').textContent).toMatch(/Total: 3 - Displaying: 1 to 3/);
  });
});

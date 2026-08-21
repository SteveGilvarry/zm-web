/**
 * Classic log viewer — the paths `logs.test.tsx` leaves out: the filter
 * controls writing back to the URL, the message search, the page-local
 * filtering warning, the server dropdown, CSV export, paging and the
 * empty/permission states.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import type { LogsSearchParams } from '@/features/logs/useLogsPage';
import type { UserClaims } from '@/types';

let mockSearch: LogsSearchParams = {};
const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: ReactNode; to?: string; [k: string]: unknown }) => (
    <a href={to ?? '#'} {...rest}>{children}</a>
  ),
  useSearch: () => mockSearch,
  useNavigate: () => mockNavigate,
}));

vi.mock('@/skins/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const VIEWER = {
  iat: 0, exp: 0, user: 'viewer',
  perms: {
    stream: 'View', events: 'View', control: 'None', monitors: 'View',
    groups: 'View', devices: 'None', snapshots: 'None', system: 'View',
  },
} as unknown as UserClaims;

/** Resolve the functional `search` updater the hook hands to navigate(). */
function lastSearch(prev: LogsSearchParams = {}): LogsSearchParams {
  const arg = mockNavigate.mock.calls.at(-1)?.[0] as { search: (p: LogsSearchParams) => LogsSearchParams };
  return arg.search(prev);
}

const LOGS = [
  { id: 1, time_key: '1780000000', component: 'zmc_m1', pid: 10, level: -2, code: 'ERR', message: 'Failed to capture image', file: 'zmc.cpp', line: 333, server_id: 1 },
  { id: 2, time_key: '1780000001', component: 'zmc_m3', pid: 11, level: -1, code: 'WAR', message: 'MQTT connect returns 14', file: 'zm_mqtt.cpp', line: 34, server_id: 1 },
  { id: 3, time_key: '1780000002', component: 'zmc_m4', pid: null, level: 0, code: 'INF', message: 'Unable to read packet', file: null, line: null, server_id: 2 },
];

const server = setupServer();
let logQueries: URLSearchParams[] = [];

function stub(opts: { logs?: unknown[]; servers?: unknown[]; total?: number; lastPage?: number } = {}) {
  const { logs = LOGS, servers = [], total = logs.length, lastPage = 1 } = opts;
  logQueries = [];
  server.use(
    http.get('/api/v3/logs', ({ request }) => {
      logQueries.push(new URL(request.url).searchParams);
      return HttpResponse.json({ items: logs, total, per_page: 50, current_page: 1, last_page: lastPage });
    }),
    http.get('/api/v3/servers', () =>
      HttpResponse.json({ items: servers, total: servers.length, per_page: 100, current_page: 1, last_page: 1 })),
  );
}

beforeAll(() => { server.listen({ onUnhandledRequest: 'error' }); });
beforeEach(() => {
  useAuthStore.setState({
    accessToken: 't', refreshToken: 't', isAuthenticated: true,
    user: { iat: 0, exp: 0, user: 'admin' } as unknown as UserClaims,
  });
});
afterEach(() => {
  server.resetHandlers();
  mockSearch = {};
  mockNavigate.mockReset();
  window.localStorage.clear();
  vi.restoreAllMocks();
});
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

async function mount() {
  const { default: Page } = await import('./logs');
  return renderWithProviders(<Page />);
}

describe('ClassicLogsPage — extra paths', () => {
  it('pushes the component filter into the URL and resets the page', async () => {
    stub();
    const user = userEvent.setup();
    await mount();
    await screen.findByTestId('log-row-1');

    await user.selectOptions(screen.getByLabelText('Component'), 'zmc_m3');
    expect(lastSearch({ page: 4 })).toEqual({ component: 'zmc_m3' });
  });

  it('pushes the exact level into the URL and then narrows the page to it', async () => {
    stub();
    const user = userEvent.setup();
    await mount();
    await screen.findByTestId('log-row-1');

    await user.selectOptions(screen.getByLabelText('Level'), '-1');
    expect(lastSearch()).toEqual({ level: -1 });

    // Re-render as the router would, with the level applied.
    cleanup();
    mockSearch = { level: -1 };
    await mount();
    await waitFor(() => expect(screen.getAllByTestId(/^log-row-/)).toHaveLength(1));
    expect(screen.getByTestId('log-row-2')).toBeInTheDocument();
    // A page-local filter warns that the total is still server-wide.
    expect(screen.getByText(/narrow the current page only/)).toBeInTheDocument();
  });

  it('clears the level again when All is chosen', async () => {
    mockSearch = { level: -1 };
    stub();
    const user = userEvent.setup();
    await mount();
    await screen.findByTestId('log-row-2');

    await user.selectOptions(screen.getByLabelText('Level'), '');
    expect(lastSearch({ level: -1 })).toEqual({});
  });

  it('commits the message search on submit and filters the page by substring', async () => {
    stub();
    const user = userEvent.setup();
    await mount();
    await screen.findByTestId('log-row-1');

    const box = screen.getByRole('searchbox', { name: 'Search messages' });
    await user.type(box, 'MQTT{Enter}');
    expect(lastSearch()).toEqual({ q: 'MQTT' });

    cleanup();
    mockSearch = { q: 'MQTT' };
    await mount();
    await waitFor(() => expect(screen.getAllByTestId(/^log-row-/)).toHaveLength(1));
    expect(screen.getByText('MQTT connect returns 14')).toBeInTheDocument();
  });

  it('commits the search draft on blur too', async () => {
    stub();
    const user = userEvent.setup();
    await mount();
    await screen.findByTestId('log-row-1');

    await user.type(screen.getByRole('searchbox', { name: 'Search messages' }), 'packet');
    await user.tab();
    expect(lastSearch()).toEqual({ q: 'packet' });
  });

  it('pushes the start and end date bounds into the URL', async () => {
    stub();
    const user = userEvent.setup();
    await mount();
    await screen.findByTestId('log-row-1');

    await user.type(screen.getByLabelText('Start Date/Time'), '2026-05-29T00:00');
    expect(lastSearch()).toEqual({ start: '2026-05-29T00:00' });

    await user.type(screen.getByLabelText('End Date/Time'), '2026-05-30T00:00');
    expect(lastSearch()).toEqual({ end: '2026-05-30T00:00' });
  });

  it('shows the server dropdown only when the install has more than one server', async () => {
    stub();
    await mount();
    await screen.findByTestId('log-row-1');
    expect(screen.queryByLabelText('Server')).toBeNull();

    cleanup();
    stub({ servers: [{ id: 1, name: 'zm-a' }, { id: 2, name: 'zm-b' }] });
    const user = userEvent.setup();
    await mount();
    const select = await screen.findByLabelText('Server');
    await user.selectOptions(select, '2');
    expect(lastSearch()).toEqual({ server_id: 2 });
  });

  it('sends the component and server filters to the backend', async () => {
    mockSearch = { component: 'zmc_m1', server_id: 2, page: 3 };
    stub({ servers: [{ id: 1, name: 'zm-a' }, { id: 2, name: 'zm-b' }] });
    await mount();

    await waitFor(() => expect(logQueries.length).toBeGreaterThan(0));
    const q = logQueries.at(-1)!;
    expect(q.get('component')).toBe('zmc_m1');
    expect(q.get('server_id')).toBe('2');
    expect(q.get('page')).toBe('3');
  });

  it('exports the filtered rows as CSV', async () => {
    const createObjectURL = vi.fn(() => 'blob:logs');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    stub();
    const user = userEvent.setup();
    await mount();
    await screen.findByTestId('log-row-1');

    await user.click(screen.getByRole('button', { name: 'Download CSV' }));
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
  });

  it('disables the CSV button when the page is empty', async () => {
    stub({ logs: [], total: 0 });
    await mount();

    expect(await screen.findByText('No matching records found')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeDisabled();
    expect(screen.getByTestId('log-status').textContent).toMatch(/Total: 0 - Displaying: 0 to 0/);
  });

  it('goes back through history from the Back square', async () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    stub();
    const user = userEvent.setup();
    await mount();
    await screen.findByTestId('log-row-1');

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(back).toHaveBeenCalledOnce();
  });

  it('refetches from the Refresh square', async () => {
    stub();
    const user = userEvent.setup();
    await mount();
    await screen.findByTestId('log-row-1');
    const before = logQueries.length;

    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(logQueries.length).toBeGreaterThan(before));
  });

  it('renders empty rather than a table when the backend is unreachable', async () => {
    server.use(
      http.get('/api/v3/logs', () => HttpResponse.error()),
      http.get('/api/v3/servers', () =>
        HttpResponse.json({ items: [], total: 0, per_page: 100, current_page: 1, last_page: 1 })),
    );
    await mount();

    // The page does not pass isError to QueryState, so a dead backend reads
    // as "no records" — see the note in the final report.
    expect(await screen.findByText('No matching records found')).toBeInTheDocument();
  });

  it('renders rows with missing pid / file / line without crashing', async () => {
    stub();
    await mount();

    const row = await screen.findByTestId('log-row-3');
    const cells = within(row).getAllByRole('cell');
    expect(cells[2]).toHaveTextContent('');
    expect(cells[5]).toHaveTextContent('');
    expect(cells[6]).toHaveTextContent('');
  });

  it('hides Clear Logs from a user without system:Edit', async () => {
    useAuthStore.setState({ user: VIEWER });
    stub();
    await mount();

    await screen.findByTestId('log-row-1');
    expect(screen.queryByRole('button', { name: /clear logs/i })).toBeNull();
  });
});

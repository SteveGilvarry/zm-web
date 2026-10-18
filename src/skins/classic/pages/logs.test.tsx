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

// ZoneMinder levels as the live box writes them: -3 FAT, -2 ERR, -1 WAR, 0 INF, 1 debug.
const logs = [
  { id: 1, time_key: '1780000000', component: 'zmc_m1', pid: 10, level: -2, code: 'ERR', message: 'Failed to capture image', file: 'zmc.cpp', line: 333, server_id: null },
  { id: 2, time_key: '1780000001', component: 'zmc_m3', pid: 11, level: -1, code: 'WAR', message: 'MQTT connect returns 14', file: 'zm_mqtt.cpp', line: 34, server_id: null },
  { id: 3, time_key: '1780000002', component: 'zmc_m4', pid: 12, level: 0, code: 'INF', message: 'Unable to read packet', file: 'zm_ffmpeg_camera.cpp', line: 184, server_id: null },
  { id: 4, time_key: '1780000003', component: 'zmc_m4', pid: 12, level: -3, code: 'FAT', message: 'Out of memory', file: 'zm_monitor.cpp', line: 9, server_id: null },
  { id: 5, time_key: '1780000004', component: 'zmc_m4', pid: 12, level: 1, code: 'DB1', message: 'Got packet', file: 'zm_monitor.cpp', line: 10, server_id: null },
];

let listQueries: URLSearchParams[] = [];
let deletes: URLSearchParams[] = [];

function stub() {
  listQueries = [];
  deletes = [];
  server.use(
    http.get('/api/v3/logs/components', () => HttpResponse.json(['web_php', 'zmc_m1', 'zmc_m3', 'zmc_m4', 'zmpkg'])),
    http.get('/api/v3/logs', ({ request }) => {
      const q = new URL(request.url).searchParams;
      // `useLogState`'s per-severity counts are page_size=1 reads; none trip.
      if (q.get('page_size') === '1') {
        return HttpResponse.json({ items: [], total: 0, per_page: 1, current_page: 1, last_page: 1 });
      }
      listQueries.push(q);
      return HttpResponse.json({
        items: logs, total: 5, per_page: 50, current_page: 1, last_page: 1, total_unfiltered: 1200,
      });
    }),
    http.delete('/api/v3/logs', ({ request }) => {
      deletes.push(new URL(request.url).searchParams);
      return HttpResponse.json({ message: 'Deleted 2 log entries' });
    }),
    http.get('/api/v3/servers', () =>
      HttpResponse.json({ items: [], total: 0, per_page: 100, current_page: 1, last_page: 1 }),
    ),
    http.get('/api/v3/configs', () =>
      HttpResponse.json({ items: [], total: 0, per_page: 1000, current_page: 1, last_page: 1 })),
    // `useDateTimeFormat` reads ZM's four date/time rows; blank = locale default.
    http.get('/api/v3/configs/:name', ({ params }) =>
      HttpResponse.json({ name: String(params.name), value: '' })),
  );
}

/** Resolve the functional `search` updater of the last navigate() call. */
function lastSearch(prev: LogsSearchParams = {}): LogsSearchParams {
  const arg = mockNavigate.mock.calls.at(-1)?.[0] as { search: (p: LogsSearchParams) => LogsSearchParams };
  return arg.search(prev);
}

describe('LogsPage — classic skin', () => {
  it('renders legacy\'s columns behind a checkbox column, every one but the box sortable', async () => {
    stub();
    await mount();
    await waitFor(() => expect(screen.getByText('Failed to capture image')).toBeInTheDocument());

    const headers = within(screen.getByTestId('log-table')).getAllByRole('columnheader');
    // Date/Time carries the active sort (▼); the rest show the sortable glyph.
    expect(headers.map((th) => th.textContent)).toEqual([
      '', 'Date/Time▼', 'Component⇵', 'PID⇵', 'Level⇵', 'Message⇵', 'File⇵', 'Line⇵',
    ]);
    expect(headers[1]).toHaveAttribute('aria-sort', 'descending');
    expect(within(headers[0]).getByRole('checkbox', { name: 'Select all' })).toBeInTheDocument();

    const row = screen.getByTestId('log-row-1');
    expect(within(row).getByText('zmc.cpp')).toBeInTheDocument();
    expect(within(row).getByText('333')).toBeInTheDocument();
    expect(within(row).getByText('ERR')).toBeInTheDocument();
  });

  it('bands rows the way legacy\'s skin.css does', async () => {
    stub();
    await mount();
    await waitFor(() => expect(screen.getByTestId('log-row-1')).toBeInTheDocument());

    expect(screen.getByTestId('log-row-1').className).toContain('bg-[#ffcccc]');
    expect(screen.getByTestId('log-row-1').className).not.toContain('font-bold');
    expect(screen.getByTestId('log-row-2').className).toContain('bg-[#ffe4b5]');
    expect(screen.getByTestId('log-row-3').className).toContain('bg-white');
    expect(screen.getByTestId('log-row-4').className).toContain('bg-[#ffcccc]');
    expect(screen.getByTestId('log-row-4').className).toContain('font-bold');
    expect(screen.getByTestId('log-row-5').className).toContain('italic');
    expect(screen.getByTestId('log-row-5').className).toContain('text-[#666666]');
  });

  it('prints State, Total, Available, Displaying and Updated', async () => {
    stub();
    await mount();
    await waitFor(() => expect(screen.getByTestId('log-status').textContent)
      .toMatch(/^State: ok - Total: 5 - Available: 1,200 - Displaying: 1 to 5 - Updated: /));
    expect(screen.getByTestId('log-state').className).toContain('text-[#28a745]');
    expect(listQueries[0].get('unfiltered_total')).toBe('true');
  });

  it('keeps Clear Logs disabled until rows are ticked, then clears exactly those ids', async () => {
    stub();
    const user = userEvent.setup();
    await mount();
    await waitFor(() => expect(screen.getByTestId('log-row-1')).toBeInTheDocument());

    const clear = screen.getByRole('button', { name: /clear logs/i });
    expect(clear).toBeDisabled();

    // The checkbox, or a click anywhere on the row (data-click-to-select).
    await user.click(screen.getByRole('checkbox', { name: 'Select log 1' }));
    await user.click(within(screen.getByTestId('log-row-3')).getByText('Unable to read packet'));
    expect(clear).toBeEnabled();
    // A selection holds the auto refresh, and the status line says so.
    expect(screen.getByTestId('log-status').textContent).toMatch(/\[stopped\]$/);

    await user.click(clear);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Clear Logs Confirmation')).toBeInTheDocument();
    expect(within(dialog).getByText('Are you sure you wish to delete the selected log entries?')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Clear Logs' }));

    await waitFor(() => expect(deletes).toHaveLength(1));
    expect([...deletes[0].entries()]).toEqual([['ids', '1,3']]);
  });

  it('ticks the whole page from the header box', async () => {
    stub();
    const user = userEvent.setup();
    await mount();
    await waitFor(() => expect(screen.getByTestId('log-row-1')).toBeInTheDocument());

    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    for (const id of [1, 2, 3, 4, 5]) {
      expect(screen.getByRole('checkbox', { name: `Select log ${id}` })).toBeChecked();
    }
    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    expect(screen.getByRole('checkbox', { name: 'Select log 1' })).not.toBeChecked();
  });

  it('sorts on any column through sort_by, Level on the code as legacy does', async () => {
    stub();
    const user = userEvent.setup();
    await mount();
    await waitFor(() => expect(screen.getByTestId('log-row-1')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /^Component/ }));
    expect(lastSearch({ page: 3 })).toEqual({ sort_by: 'component', sort: 'asc' });
    await user.click(screen.getByRole('button', { name: /^Level/ }));
    expect(lastSearch()).toEqual({ sort_by: 'code', sort: 'asc' });
    // Date/Time is the column already sorted (desc), so it flips.
    await user.click(screen.getByRole('button', { name: /^Date\/Time/ }));
    expect(lastSearch()).toEqual({ sort: 'asc' });
  });

  it('marks the sorted column from the URL and sends it', async () => {
    mockSearch = { sort_by: 'file' };
    stub();
    await mount();
    await waitFor(() => expect(screen.getByTestId('log-row-1')).toBeInTheDocument());

    const file = within(screen.getByTestId('log-table')).getByRole('columnheader', { name: /^File/ });
    expect(file).toHaveAttribute('aria-sort', 'descending');
    expect(listQueries.at(-1)?.get('sort_by')).toBe('file');
    expect(listQueries.at(-1)?.get('sort')).toBe('desc');
  });

  it('lists every component from GET /logs/components and every legacy level', async () => {
    stub();
    await mount();
    await waitFor(() => expect(screen.getByRole('option', { name: 'zmpkg' })).toBeInTheDocument());

    const component = screen.getByLabelText('Component') as HTMLSelectElement;
    expect(Array.from(component.options, (o) => o.textContent))
      .toEqual(['All', 'web_php', 'zmc_m1', 'zmc_m3', 'zmc_m4', 'zmpkg']);
    const level = screen.getByLabelText('Level') as HTMLSelectElement;
    expect(level.multiple).toBe(true);
    expect(Array.from(level.options, (o) => o.value))
      .toEqual(['DBG', 'INF', 'WAR', 'ERR', 'FAT', 'PNC', 'AUD', 'OFF']);
  });

  it('hides a column from the column chooser and remembers it', async () => {
    stub();
    const user = userEvent.setup();
    await mount();
    await waitFor(() => expect(screen.getByTestId('log-row-1')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Columns' }));
    await user.click(within(screen.getByRole('menu')).getByLabelText('File'));
    expect(within(screen.getByTestId('log-table')).queryByRole('columnheader', { name: /^File/ })).toBeNull();
    expect(screen.queryByText('zmc.cpp')).toBeNull();
    expect(JSON.parse(window.localStorage.getItem('zm-web.logs.classicHiddenColumns') ?? '[]')).toEqual(['file']);
  });

  it('puts the table into fullscreen from the toolbar', async () => {
    stub();
    const user = userEvent.setup();
    const requestFullscreen = vi.fn(() => Promise.resolve());
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { value: requestFullscreen, configurable: true });
    await mount();
    await waitFor(() => expect(screen.getByTestId('log-row-1')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Toggle fullscreen' }));
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it('offers the legacy filter fields', async () => {
    stub();
    await mount();
    await waitFor(() => expect(screen.getByTestId('log-row-1')).toBeInTheDocument());

    expect(screen.getByLabelText('Component')).toBeInTheDocument();
    expect(screen.getByLabelText('Level')).toBeInTheDocument();
    expect(screen.getByLabelText('Start Date/Time')).toBeInTheDocument();
    expect(screen.getByLabelText('End Date/Time')).toBeInTheDocument();
  });
});

/**
 * The filter log panel (legacy 1.39.41 `#FilterLog`, filter.php:394-412) in
 * both skins: the selected filter's `zmfilter_<Id>` rows, ten a page, for
 * System viewers, with Clear Logs for System editors.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to?: string }) => <a href={to ?? '#'}>{children}</a>,
}));

const { ClassicFilterLogPanel } = await import('@/skins/classic/components/FilterLogPanel');
const { ModernFilterLogPanel } = await import('@/skins/modern/components/FilterLogPanel');

type Level = 'None' | 'View' | 'Edit';
let systemLevel: Level = 'Edit';
let logRequests: URLSearchParams[] = [];
let deletes: URLSearchParams[] = [];
const rows = [
  { id: 2, time_key: '1760000060', level: -2, code: 'ERR', component: 'zmfilter_4', message: 'Cannot open event 33285', pid: 101, file: 'zmfilter.pl', line: 210 },
  { id: 1, time_key: '1760000000', level: 0, code: 'INF', component: 'zmfilter_4', message: 'Checking filter PurgeWhenFull', pid: 101, file: 'zmfilter.pl', line: 180 },
];
let lastPage = 1;

const server = setupServer(
  http.get('/api/v3/me', () => HttpResponse.json({
    id: 1, username: 'admin', enabled: 1, stream: 'View', events: 'Edit', control: 'None', monitors: 'View',
    groups: 'View', devices: 'None', snapshots: 'None', system: systemLevel,
  })),
  http.get('/api/v3/logs', ({ request }) => {
    logRequests.push(new URL(request.url).searchParams);
    return HttpResponse.json({ items: rows, total: rows.length, per_page: 10, current_page: 1, last_page: lastPage });
  }),
  http.delete('/api/v3/logs', ({ request }) => {
    deletes.push(new URL(request.url).searchParams);
    return HttpResponse.json({ message: 'Deleted 2 log entries' });
  }),
  http.get('/api/v3/configs', () => HttpResponse.json({ items: [], total: 0, per_page: 1000, current_page: 1, last_page: 1 })),
  http.get('/api/v3/configs/:name', () => HttpResponse.json({ kind: 'NOT_FOUND' }, { status: 404 })),
  http.get('/api/v3/system/locale', () => HttpResponse.json({ timezone: 'UTC' })),
);

beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', isAuthenticated: true,
    user: { user: 'admin', iat: 0, exp: 0 } as never,
  });
  server.listen({ onUnhandledRequest: 'bypass' });
});
afterEach(() => {
  server.resetHandlers();
  systemLevel = 'Edit';
  logRequests = [];
  deletes = [];
  lastPage = 1;
});
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

describe.each([
  ['classic', ClassicFilterLogPanel],
  ['modern', ModernFilterLogPanel],
] as const)('%s filter log panel', (_skin, Panel) => {
  it("lists the filter's own zmfilter_<Id> rows, ten a page, newest first", async () => {
    renderWithProviders(<Panel filterId={4} />);
    const table = await screen.findByTestId('filter-log-table');
    expect(await within(table).findByText(/Checking filter PurgeWhenFull/)).toBeInTheDocument();
    expect(within(table).getByText('ERR')).toBeInTheDocument();
    const q = logRequests.at(-1)!;
    expect(q.get('component')).toBe('zmfilter_4');
    expect(q.get('page_size')).toBe('10');
    expect(q.get('sort')).toBe('desc');
  });

  it('pages through the log', async () => {
    const user = userEvent.setup();
    lastPage = 3;
    renderWithProviders(<Panel filterId={4} />);
    await screen.findByTestId('filter-log-table');
    await user.click(await screen.findByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(logRequests.at(-1)!.get('page')).toBe('2'));
  });

  it('clears only this filter\'s rows after confirming', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Panel filterId={4} />);
    await screen.findByTestId('filter-log-table');
    await user.click(screen.getAllByRole('button', { name: /Clear Logs/ })[0]);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Clear Logs' }));
    await waitFor(() => expect(deletes).toHaveLength(1));
    expect(deletes[0].get('component')).toBe('zmfilter_4');
  });

  it('offers no Clear Logs to a System viewer', async () => {
    systemLevel = 'View';
    renderWithProviders(<Panel filterId={4} />);
    await screen.findByTestId('filter-log-table');
    await waitFor(() => expect(screen.queryByRole('button', { name: /Clear Logs/ })).toBeNull());
  });

  it('is not there at all without System view', async () => {
    systemLevel = 'None';
    renderWithProviders(<Panel filterId={4} />);
    await waitFor(() => expect(screen.queryByTestId('filter-log')).toBeNull());
    // Once /me has answered, nothing asks for the log.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('filter-log')).toBeNull();
  });
});

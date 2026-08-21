/**
 * Report detail (classic skin): the legacy toolbar over the two-column form
 * plus the events-per-hour chart the linked filter drives.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/components/common/toastStore';

const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: ReactNode; to?: string; search?: unknown }) => {
    delete rest.search;
    return <a href={to ?? '#'} {...rest}>{children}</a>;
  },
  useSearch: () => ({}),
  useNavigate: () => mockNavigate,
}));
vi.mock('@/skins/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const ALL_EDIT = {
  stream: 'Edit', events: 'Edit', control: 'Edit', monitors: 'Edit',
  groups: 'Edit', devices: 'Edit', snapshots: 'Edit', system: 'Edit',
};
const ADMIN = { iat: 0, exp: 4102444800, user: 'admin', uid: 1, perms: ALL_EDIT };
const VIEWER = { ...ADMIN, user: 'viewer', uid: 2, perms: { ...ALL_EDIT, events: 'View' } };

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
  mockNavigate.mockClear();
});
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

const paged = <T,>(items: T[], over: Record<string, number> = {}) => ({
  items, total: items.length, per_page: 200, current_page: 1, last_page: 1, ...over,
});

const REPORT = {
  id: 7,
  name: 'Weekly motion',
  filter_id: 4,
  start_date_time: '2026-08-01T00:00:00Z',
  end_date_time: '2026-08-08T00:00:00Z',
  interval: 60,
};

const FILTERS = [
  { id: 4, name: 'Motion only', query_json: '{"terms":[]}' },
  { id: 5, name: 'Archived', query_json: '{"terms":[]}' },
];

const EVENTS = [
  { id: 100, monitor_id: 1, name: 'Event 100', start_date_time: '2026-08-02T09:15:00Z', end_date_time: '2026-08-02T09:16:00Z', length: '60.00' },
  { id: 101, monitor_id: 1, name: 'Event 101', start_date_time: '2026-08-02T11:00:00Z', end_date_time: '2026-08-02T11:00:30Z', length: '30.00' },
];

let sent: Array<{ method: string; path: string; body: Record<string, unknown> | null }> = [];

function seed(over: unknown[] = []) {
  sent = [];
  server.use(
    ...(over as never[]),
    http.get('/api/v3/reports/:id', ({ params }) =>
      HttpResponse.json({ ...REPORT, id: Number(params.id) })),
    http.get('/api/v3/filters', () => HttpResponse.json(paged(FILTERS))),
    http.get('/api/v3/filters/:id', ({ params }) => {
      const found = FILTERS.find((f) => f.id === Number(params.id));
      return found
        ? HttpResponse.json(found)
        : HttpResponse.json({ kind: 'NOT_FOUND', error_message: 'no such filter' }, { status: 404 });
    }),
    http.get('/api/v3/events', () => HttpResponse.json(paged(EVENTS, { per_page: 500 }))),
    http.patch('/api/v3/reports/:id', async ({ request, params }) => {
      const body = await request.json() as Record<string, unknown>;
      sent.push({ method: 'PATCH', path: `/reports/${params.id}`, body });
      return HttpResponse.json({ ...REPORT, ...body, id: Number(params.id) });
    }),
    http.delete('/api/v3/reports/:id', ({ params }) => {
      sent.push({ method: 'DELETE', path: `/reports/${params.id}`, body: null });
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

async function mount(reportId = 7) {
  const { default: Page } = await import('./reports.detail');
  return renderWithProviders(<Page reportId={reportId} />);
}

describe('ClassicReportDetailPage', () => {
  it('renders the legacy form filled from the report', async () => {
    signIn();
    seed();
    await mount();

    const name = await screen.findByLabelText('Name');
    expect(name).toHaveValue('Weekly motion');
    expect(screen.getByLabelText('Filter')).toHaveValue('4');
    expect(screen.getByLabelText('Interval')).toHaveValue(60);
    // Start/End are datetime-local, i.e. the report's stamps in local time.
    expect((screen.getByLabelText('Start') as HTMLInputElement).value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    // The filter select lists every filter plus the "select" placeholder.
    expect(screen.getAllByRole('option').map((o) => o.textContent))
      .toEqual(['select', 'Motion only', 'Archived']);
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/reports');
  });

  it('Save PATCHes the edited draft and reports success', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();

    const name = await screen.findByLabelText('Name');
    await user.clear(name);
    await user.type(name, '  Monthly motion  ');
    await user.selectOptions(screen.getByLabelText('Filter'), '5');
    await user.clear(screen.getByLabelText('Interval'));
    await user.type(screen.getByLabelText('Interval'), '30');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].method).toBe('PATCH');
    expect(sent[0].path).toBe('/reports/7');
    expect(sent[0].body!.name).toBe('Monthly motion');
    expect(sent[0].body!.filter_id).toBe(5);
    expect(sent[0].body!.interval).toBe(30);
    expect(typeof sent[0].body!.start_date_time).toBe('string');

    expect(await screen.findByText('Saved.')).toBeInTheDocument();
  });

  it('a blank name and no filter save as nulls', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();

    await user.clear(await screen.findByLabelText('Name'));
    await user.selectOptions(screen.getByLabelText('Filter'), '');
    await user.clear(screen.getByLabelText('Interval'));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].body!.name).toBeNull();
    expect(sent[0].body!.filter_id).toBeNull();
    expect(sent[0].body!.interval).toBeNull();
  });

  it('shows the failure message when the save is rejected', async () => {
    signIn();
    seed([
      http.patch('/api/v3/reports/:id', () =>
        HttpResponse.json({ kind: 'VALIDATION', error_message: 'interval too small' }, { status: 422 })),
    ]);
    const user = userEvent.setup();
    await mount();

    await screen.findByLabelText('Name');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Save failed. Try again.')).toBeInTheDocument();
    expect(useToastStore.getState().toasts.map((t) => t.message)).toContain('interval too small');
  });

  it('Delete asks first, then DELETEs and returns to the list', async () => {
    signIn();
    seed();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    await mount();

    await screen.findByLabelText('Name');
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(confirmSpy).toHaveBeenCalledWith('Delete report "Weekly motion"?');
    expect(sent).toHaveLength(0);

    confirmSpy.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(sent).toEqual([{ method: 'DELETE', path: '/reports/7', body: null }]));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/reports' }));
    confirmSpy.mockRestore();
  });

  it('charts the linked filter\'s matching events', async () => {
    signIn();
    seed();
    await mount();

    await screen.findByLabelText('Name');
    await waitFor(() => expect(screen.getByText('Events per hour')).toBeInTheDocument());
    // Two events matched by an empty term list → one dated series, no empty state.
    await waitFor(() => expect(screen.queryByTestId('report-chart-no-data')).toBeNull());
    expect(screen.queryByTestId('report-chart-empty')).toBeNull();
  });

  it('says so when the filter matches nothing', async () => {
    signIn();
    seed([http.get('/api/v3/events', () => HttpResponse.json(paged([], { per_page: 500 })))]);
    await mount();
    expect(await screen.findByTestId('report-chart-no-data')).toHaveTextContent(
      'No matching events in the most recent 500.');
  });

  it('prompts for a filter when the report has none', async () => {
    signIn();
    seed([
      http.get('/api/v3/reports/:id', () => HttpResponse.json({ ...REPORT, filter_id: null })),
    ]);
    await mount();
    expect(await screen.findByTestId('report-chart-empty')).toHaveTextContent(
      'Select a Filter to populate the chart.');
  });

  it('reports a filter that cannot be loaded without blanking the form', async () => {
    signIn();
    seed([
      http.get('/api/v3/filters/:id', () =>
        HttpResponse.json({ kind: 'NOT_FOUND', error_message: 'gone' }, { status: 404 })),
    ]);
    await mount();
    expect(await screen.findByText('Could not load filter #4.')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Weekly motion');
  });

  it('renders the 500 branch as an alert', async () => {
    signIn();
    seed([
      http.get('/api/v3/reports/:id', () =>
        HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'Reports table locked' }, { status: 500 })),
    ]);
    await mount();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Cannot reach the server.');
    expect(within(alert).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).toBeNull();
  });

  it('renders a network failure as an alert too', async () => {
    signIn();
    seed([http.get('/api/v3/reports/:id', () => HttpResponse.error())]);
    await mount();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('treats a 403 on the report as an error state', async () => {
    signIn();
    seed([
      http.get('/api/v3/reports/:id', () =>
        HttpResponse.json({ kind: 'FORBIDDEN', error_message: 'nope' }, { status: 403 })),
    ]);
    await mount();
    // A 403 is a permission problem, not an outage: QueryState says so and
    // offers no Retry.
    // The loading frame also uses role="status", so wait for the settled text.
    expect(await screen.findByText('You do not have permission to view this.'))
      .toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('read-only without events Edit: form renders, Save and Delete are gone', async () => {
    signIn(VIEWER);
    seed();
    await mount();

    expect(await screen.findByLabelText('Name')).toHaveValue('Weekly motion');
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Back' })).toBeInTheDocument();
  });

  it('renders nothing when signed out', async () => {
    useAuthStore.setState({ accessToken: null, refreshToken: null, isAuthenticated: false, user: null });
    const { container } = await mount();
    expect(container).toBeEmptyDOMElement();
  });
});

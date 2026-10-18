/**
 * Classic reports list — the paths `reports.list.test.tsx` leaves out: the
 * create form's POST body, delete-with-confirm, the empty and error states,
 * and the read-only render for a user without events:Edit.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { toApiDateTime } from '@/features/reports/datetime';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/components/common/toastStore';
import type { UserClaims } from '@/types';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params, ...rest }: {
    children: ReactNode; to?: string; params?: Record<string, string>; [k: string]: unknown;
  }) => {
    const href = to && params
      ? Object.entries(params).reduce((acc, [k, v]) => acc.replace(`$${k}`, v), to)
      : (to ?? '#');
    return <a href={href} {...rest}>{children}</a>;
  },
}));

vi.mock('@/skins/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const VIEWER = {
  iat: 0, exp: 0, user: 'viewer',
  perms: {
    stream: 'View', events: 'View', control: 'None', monitors: 'View',
    groups: 'View', devices: 'None', snapshots: 'None', system: 'None',
  },
} as unknown as UserClaims;

const paged = <T,>(items: T[]) => ({
  items, total: items.length, per_page: 200, current_page: 1, last_page: 1,
});

const REPORTS = [
  { id: 1, name: 'Weekly motion', filter_id: 7, start_date_time: '2026-05-25T00:00:00Z', end_date_time: '2026-06-01T00:00:00Z', interval: 60 },
  { id: 2, name: null, filter_id: 99, start_date_time: null, end_date_time: null, interval: null },
];
const FILTERS = [
  { id: 7, name: 'High-score motion', query_json: '{"terms":[]}', auto_archive: 0, auto_delete: 0, execute_interval: 0 },
];

const server = setupServer();
const created: unknown[] = [];
const deleted: string[] = [];

function stub(reports: unknown[] = REPORTS) {
  server.use(
    http.get('/api/v3/reports', () => HttpResponse.json(paged(reports))),
    http.get('/api/v3/filters', () => HttpResponse.json(paged(FILTERS))),
    http.post('/api/v3/reports', async ({ request }) => {
      const body = await request.json();
      created.push(body);
      return HttpResponse.json({ id: 3, ...(body as object) });
    }),
    http.delete('/api/v3/reports/:id', ({ params }) => {
      deleted.push(String(params.id));
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

beforeAll(() => { server.listen({ onUnhandledRequest: 'error' }); });
beforeEach(() => {
  // No `perms` claim → Edit everywhere (legacy backend), so the verbs show.
  useAuthStore.setState({
    accessToken: 't', refreshToken: 't', isAuthenticated: true,
    user: { iat: 0, exp: 0, user: 'admin' } as unknown as UserClaims,
  });
});
afterEach(() => {
  server.resetHandlers();
  created.length = 0;
  deleted.length = 0;
  useToastStore.getState().clear();
  vi.restoreAllMocks();
});
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

async function mount() {
  const { default: Page } = await import('./reports.list');
  return renderWithProviders(<Page />);
}

describe('ClassicReportsListPage — extra paths', () => {
  it('POSTs the create form with ISO timestamps and a null name when blank', async () => {
    stub();
    const user = userEvent.setup();
    await mount();
    await screen.findByText('Weekly motion');

    await user.click(screen.getByRole('button', { name: 'Add New Report' }));
    const form = screen.getByTestId('report-create-form');
    await user.selectOptions(within(form).getByLabelText('Filter'), '7');
    await user.clear(within(form).getByLabelText('Start'));
    await user.type(within(form).getByLabelText('Start'), '2026-08-01T00:00');
    await user.clear(within(form).getByLabelText('End'));
    await user.type(within(form).getByLabelText('End'), '2026-08-08T00:00');
    // Seconds, as the API stores them: one day.
    await user.type(within(form).getByLabelText('Interval'), '86400');
    await user.click(within(form).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]).toEqual({
      name: null,
      // Whole seconds: zm-api rejects a fractional part (see toApiDateTime).
      start_date_time: toApiDateTime(new Date('2026-08-01T00:00')),
      end_date_time: toApiDateTime(new Date('2026-08-08T00:00')),
      filter_id: 7,
      interval: 86400,
    });
    // A successful create closes the form again.
    await waitFor(() => expect(screen.queryByTestId('report-create-form')).toBeNull());
  });

  it('sends a trimmed name and null filter/interval when they are left blank', async () => {
    stub();
    const user = userEvent.setup();
    await mount();
    await screen.findByText('Weekly motion');

    await user.click(screen.getByRole('button', { name: 'Add New Report' }));
    const form = screen.getByTestId('report-create-form');
    await user.type(within(form).getByLabelText('Name'), '  Nightly  ');
    await user.click(within(form).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]).toMatchObject({ name: 'Nightly', filter_id: null, interval: null });
  });

  it('deletes the marked reports after the legacy confirmation', async () => {
    stub();
    const user = userEvent.setup();
    await mount();
    await screen.findByText('Weekly motion');

    const del = screen.getByRole('button', { name: 'Delete' });
    expect(del).toBeDisabled();
    await user.click(within(screen.getByTestId('report-row-1')).getByRole('checkbox'));
    await user.click(within(screen.getByTestId('report-row-2')).getByRole('checkbox'));
    expect(del).toBeEnabled();
    await user.click(del);

    expect(screen.getByText('Are you sure you wish to delete the selected reports?')).toBeInTheDocument();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleted).toEqual(['1', '2']));
  });

  it('marks every row from the header box and leaves them alone when the dialog is cancelled', async () => {
    stub();
    const user = userEvent.setup();
    await mount();
    await screen.findByText('Weekly motion');

    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    expect(within(screen.getByTestId('report-row-2')).getByRole('checkbox')).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(deleted).toEqual([]);
  });

  it('falls back to "untitled" when the report has no name, and leaves blank cells blank', async () => {
    stub();
    await mount();

    const row = await screen.findByTestId('report-row-2');
    expect(within(row).getByText('untitled')).toBeInTheDocument();
    expect(within(row).queryByText('—')).toBeNull();
  });

  it('searches by name or id and pages ten rows at a time, as bootstrap-table does', async () => {
    const many = Array.from({ length: 23 }, (_, i) => ({
      id: i + 1, name: `Report ${String(i + 1).padStart(2, '0')}`, filter_id: null,
      start_date_time: null, end_date_time: null, interval: 86400,
    }));
    stub(many);
    const user = userEvent.setup();
    await mount();
    await screen.findByText('Report 01');

    expect(screen.getByText('Showing 1 to 10 of 23 rows')).toBeInTheDocument();
    expect(screen.queryByText('Report 11')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Go to page 3' }));
    expect(screen.getByText('Report 21')).toBeInTheDocument();
    expect(screen.getByText('Showing 21 to 23 of 23 rows')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Rows per page'), 'All');
    expect(screen.getByText('Report 01')).toBeInTheDocument();
    expect(screen.getByText('Report 23')).toBeInTheDocument();

    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'report 1');
    expect(screen.getByText('Showing 1 to 10 of 10 rows')).toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox', { name: 'Search' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search' }), '07');
    expect(screen.getByTestId('report-row-7')).toBeInTheDocument();
    expect(screen.queryByTestId('report-row-17')).toBeNull();
  });

  it('shows the empty message when there are no saved reports', async () => {
    stub([]);
    await mount();
    expect(await screen.findByText('No matching records found')).toBeInTheDocument();
    expect(screen.queryByTestId('reports-table')).toBeNull();
  });

  it('hides New and Delete from a user without events:Edit', async () => {
    useAuthStore.setState({ user: VIEWER });
    stub();
    await mount();

    await screen.findByText('Weekly motion');
    expect(screen.queryByRole('button', { name: 'Add New Report' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete report' })).toBeNull();
  });

  it('shows the unreachable state when the backend is down, not an empty table', async () => {
    server.use(
      http.get('/api/v3/reports', () => HttpResponse.error()),
      http.get('/api/v3/filters', () => HttpResponse.json(paged(FILTERS))),
    );
    await mount();

    expect(await screen.findByText('Cannot reach the server.')).toBeInTheDocument();
    expect(screen.queryByText('No matching records found')).toBeNull();
  });
});

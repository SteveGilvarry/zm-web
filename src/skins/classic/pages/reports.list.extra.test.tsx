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

    await user.click(screen.getByRole('button', { name: '+ New' }));
    const form = screen.getByTestId('report-create-form');
    await user.selectOptions(within(form).getByLabelText('Filter'), '7');
    await user.clear(within(form).getByLabelText('Start'));
    await user.type(within(form).getByLabelText('Start'), '2026-08-01T00:00');
    await user.clear(within(form).getByLabelText('End'));
    await user.type(within(form).getByLabelText('End'), '2026-08-08T00:00');
    await user.type(within(form).getByLabelText('Interval'), '30');
    await user.click(within(form).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]).toEqual({
      name: null,
      // Whole seconds: zm_api rejects a fractional part (see toApiDateTime).
      start_date_time: toApiDateTime(new Date('2026-08-01T00:00')),
      end_date_time: toApiDateTime(new Date('2026-08-08T00:00')),
      filter_id: 7,
      interval: 30,
    });
    // A successful create closes the form again.
    await waitFor(() => expect(screen.queryByTestId('report-create-form')).toBeNull());
  });

  it('sends a trimmed name and null filter/interval when they are left blank', async () => {
    stub();
    const user = userEvent.setup();
    await mount();
    await screen.findByText('Weekly motion');

    await user.click(screen.getByRole('button', { name: '+ New' }));
    const form = screen.getByTestId('report-create-form');
    await user.type(within(form).getByLabelText('Name'), '  Nightly  ');
    await user.click(within(form).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]).toMatchObject({ name: 'Nightly', filter_id: null, interval: null });
  });

  it('deletes a report after confirming', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    stub();
    const user = userEvent.setup();
    await mount();
    await screen.findByText('Weekly motion');

    const row = screen.getByTestId('report-row-1');
    await user.click(within(row).getByRole('button', { name: 'Delete report' }));

    expect(confirm).toHaveBeenCalledWith('Delete report "Weekly motion"?');
    await waitFor(() => expect(deleted).toEqual(['1']));
  });

  it('leaves the report alone when the confirmation is dismissed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    stub();
    const user = userEvent.setup();
    await mount();
    await screen.findByText('Weekly motion');

    await user.click(within(screen.getByTestId('report-row-1')).getByRole('button', { name: 'Delete report' }));
    expect(deleted).toEqual([]);
  });

  it('falls back to "untitled" and "#id" when the report has no name or an unknown filter', async () => {
    stub();
    await mount();

    const row = await screen.findByTestId('report-row-2');
    expect(within(row).getByText('untitled')).toBeInTheDocument();
    expect(within(row).getByText('#99')).toBeInTheDocument();
    expect(within(row).getAllByText('—')).toHaveLength(2);
  });

  it('shows the empty message when there are no saved reports', async () => {
    stub([]);
    await mount();
    expect(await screen.findByText('No reports yet. Create one to start.')).toBeInTheDocument();
    expect(screen.queryByTestId('reports-table')).toBeNull();
  });

  it('hides New and Delete from a user without events:Edit', async () => {
    useAuthStore.setState({ user: VIEWER });
    stub();
    await mount();

    await screen.findByText('Weekly motion');
    expect(screen.queryByRole('button', { name: '+ New' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete report' })).toBeNull();
  });

  it('shows the unreachable state when the backend is down, not an empty table', async () => {
    server.use(
      http.get('/api/v3/reports', () => HttpResponse.error()),
      http.get('/api/v3/filters', () => HttpResponse.json(paged(FILTERS))),
    );
    await mount();

    expect(await screen.findByText('Cannot reach the server.')).toBeInTheDocument();
    expect(screen.queryByText('No reports yet. Create one to start.')).toBeNull();
  });
});

/**
 * Integration tests for the classic-skin reports list. Router `<Link>` is
 * shimmed to an anchor; `/reports` and `/filters` come from MSW.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children, to, params, ...rest
  }: {
    children: React.ReactNode; to?: string; params?: Record<string, string>; [k: string]: unknown;
  }) => {
    const href = to && params
      ? Object.entries(params).reduce((acc, [k, v]) => acc.replace(`$${k}`, v), to)
      : (to ?? '#');
    return <a href={href} {...rest}>{children}</a>;
  },
}));

vi.mock('@/skins/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const server = setupServer();
beforeAll(() => {
  // No `perms` claim → Edit everywhere, so the events-Edit gate around New / Delete opens.
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test',
    user: { iat: 0, exp: 0, user: 'admin' }, isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

async function mount() {
  const { default: Page } = await import('./reports.list');
  return renderWithProviders(<Page />);
}

const reports = [
  { id: 1, name: 'Weekly motion', filter_id: 7, start_date_time: '2026-05-25T00:00:00Z', end_date_time: '2026-06-01T00:00:00Z', interval: 86400 },
  { id: 2, name: 'Archived only', filter_id: null, start_date_time: null, end_date_time: null, interval: null },
];
const filters = [
  { id: 7, name: 'High-score motion', query_json: '{"terms":[]}', auto_archive: 0, auto_delete: 0, execute_interval: 0 },
];

function stub() {
  server.use(
    http.get('/api/v3/reports', () =>
      HttpResponse.json({ items: reports, total: reports.length, per_page: 200, current_page: 1, last_page: 1 }),
    ),
    http.get('/api/v3/filters', () =>
      HttpResponse.json({ items: filters, total: filters.length, per_page: 200, current_page: 1, last_page: 1 }),
    ),
  );
}

describe('ReportsListPage — classic skin', () => {
  it('renders the legacy table with names linked to the detail page', async () => {
    stub();
    await mount();
    await waitFor(() => expect(screen.getByText('Weekly motion')).toBeInTheDocument());

    const headers = within(screen.getByTestId('reports-table'))
      .getAllByRole('columnheader')
      .map((th) => th.textContent);
    // reports.php: mark, Id, Name, (Description, not served), Starting, Ending, Interval.
    expect(headers).toEqual(['', 'Id', 'Name', 'Starting', 'Ending', 'Interval']);

    expect(screen.getByRole('link', { name: 'Weekly motion' }).getAttribute('href')).toBe('/reports/1');
    expect(screen.getByRole('link', { name: '1' }).getAttribute('href')).toBe('/reports/1');
    expect(screen.getByText('Archived only')).toBeInTheDocument();

    // Interval prints as stored: seconds.
    const row = screen.getByTestId('report-row-1');
    expect(within(row).getByText('86400')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });

  it('toggles the inline create form from Add New Report', async () => {
    stub();
    const user = userEvent.setup();
    await mount();
    await waitFor(() => expect(screen.getByText('Weekly motion')).toBeInTheDocument());

    expect(screen.queryByTestId('report-create-form')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Add New Report' }));
    const form = screen.getByTestId('report-create-form');
    expect(within(form).getByLabelText('Name')).toBeInTheDocument();
    expect(within(form).getByLabelText('Filter')).toBeInTheDocument();
    expect(within(form).getByRole('option', { name: 'High-score motion' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByTestId('report-create-form')).toBeNull();
  });
});

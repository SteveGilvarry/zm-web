/**
 * Integration tests for the Reports detail route (P26).
 *
 * The route component pulls in TanStack Router; we stub the router exports
 * the same way Groups/Filters route tests do, and serve `getReport` /
 * `listFilters` / `getFilter` / `getEvents` from MSW.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';

// Route params are injected by TanStack Router in the real app; stub
// `useParams` so the route can be mounted standalone in a unit test.
const MOCK_PARAMS = { reportId: '42' };

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (cfg: unknown) => {
    const route = cfg as { component: unknown };
    return {
      ...route,
      useParams: () => MOCK_PARAMS,
    };
  },
  Link: ({
    children,
    to,
    params,
    ...rest
  }: {
    children: React.ReactNode;
    to?: string;
    params?: Record<string, string>;
  }) => {
    const href =
      to && params
        ? Object.entries(params).reduce(
            (acc, [k, v]) => acc.replace(`$${k}`, v),
            to,
          )
        : (to ?? '#');
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  },
}));

vi.mock('@/skins/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test',
    refreshToken: 'test',
    user: null,
    isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

async function mount() {
  const mod = await import('./$reportId');
  const Page = (mod.Route as unknown as { component: React.ComponentType }).component;
  return renderWithProviders(<Page />);
}

const sampleReport = {
  id: 42,
  name: 'Weekly motion',
  filter_id: 7,
  start_date_time: '2026-05-25T00:00:00Z',
  end_date_time: '2026-06-01T00:00:00Z',
  interval: 60,
};

const sampleFilters = [
  {
    id: 7,
    name: 'High-score motion',
    query_json: JSON.stringify({
      rules: [
        { field: 'max_score', operator: '>', value: '50', conjunction: 'and' },
      ],
    }),
    auto_archive: 0,
    auto_delete: 0,
    execute_interval: 0,
  },
];

const sampleEvents = [
  {
    id: 1,
    monitor_id: 1,
    start_date_time: '2026-06-03T10:15:00Z',
    length: 30,
    max_score: 80,
    archived: 0,
  },
  {
    id: 2,
    monitor_id: 1,
    start_date_time: '2026-06-03T11:00:00Z',
    length: 12,
    max_score: 90,
    archived: 0,
  },
  {
    // Below the score threshold — should be filtered out.
    id: 3,
    monitor_id: 1,
    start_date_time: '2026-06-03T12:00:00Z',
    length: 9,
    max_score: 10,
    archived: 0,
  },
];

function stubAll() {
  server.use(
    http.get('/api/v3/reports/42', () => HttpResponse.json(sampleReport)),
    http.get('/api/v3/filters', () =>
      HttpResponse.json({
        items: sampleFilters,
        total: sampleFilters.length,
        per_page: 200,
        current_page: 1,
        last_page: 1,
      }),
    ),
    http.get('/api/v3/filters/7', () => HttpResponse.json(sampleFilters[0])),
    http.get('/api/v3/events', () =>
      HttpResponse.json({
        items: sampleEvents,
        total: sampleEvents.length,
        per_page: 500,
        current_page: 1,
        last_page: 1,
      }),
    ),
  );
}

describe('ReportDetailPage — load + edit form', () => {
  it('pre-fills the form from getReport(id)', async () => {
    stubAll();
    await mount();

    const nameInput = await screen.findByDisplayValue('Weekly motion');
    expect(nameInput).toBeInTheDocument();

    const filterSelect = screen.getByRole('combobox') as HTMLSelectElement;
    expect(filterSelect.value).toBe('7');

    const intervalInput = screen.getByPlaceholderText(/minutes/i) as HTMLInputElement;
    expect(intervalInput.value).toBe('60');
  });

  it('sends a PATCH to /reports/:id on Save', async () => {
    stubAll();
    let body: Record<string, unknown> = {};
    server.use(
      http.patch('/api/v3/reports/42', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...sampleReport, name: 'Renamed' });
      }),
    );

    const user = userEvent.setup();
    await mount();

    const nameInput = await screen.findByDisplayValue('Weekly motion');
    await user.clear(nameInput);
    await user.type(nameInput, 'Renamed');

    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(body.name).toBe('Renamed'));
    expect(body.filter_id).toBe(7);
    expect(body.interval).toBe(60);
  });

  it('confirms then DELETEs the report', async () => {
    stubAll();
    let deletedId: string | null = null;
    server.use(
      http.delete('/api/v3/reports/:id', ({ params }) => {
        deletedId = params.id as string;
        return HttpResponse.json({}, { status: 204 });
      }),
    );

    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    await mount();
    await screen.findByDisplayValue('Weekly motion');

    await user.click(screen.getByRole('button', { name: /delete/i }));

    expect(confirmSpy).toHaveBeenCalledOnce();
    await waitFor(() => expect(deletedId).toBe('42'));
    confirmSpy.mockRestore();
  });
});

describe('ReportDetailPage — chart panel', () => {
  it('renders the events-per-hour chart after fetching events for the linked filter', async () => {
    stubAll();
    await mount();

    // Wait for chart svg to appear; bucketing keeps only the two
    // high-score matches in the 10:00 and 11:00 buckets.
    const chart = await screen.findByTestId('events-per-hour-chart');
    expect(chart).toBeInTheDocument();
  });

  it('shows the empty state when the report has no filter', async () => {
    server.use(
      http.get('/api/v3/reports/42', () =>
        HttpResponse.json({ ...sampleReport, filter_id: null }),
      ),
      http.get('/api/v3/filters', () =>
        HttpResponse.json({
          items: sampleFilters,
          total: sampleFilters.length,
          per_page: 200,
          current_page: 1,
          last_page: 1,
        }),
      ),
    );

    await mount();

    expect(
      await screen.findByTestId('report-chart-empty'),
    ).toHaveTextContent(/Select a Filter/i);
  });
});

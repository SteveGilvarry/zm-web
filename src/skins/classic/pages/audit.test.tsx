/**
 * Integration-style tests for the audit page (classic skin): the legacy
 * table from `/reports/event-audit` — Events / FirstEvent / LastEvent / MinGap /
 * MaxGap and the file checks per monitor — and its deep links.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';

let mockSearch: Record<string, unknown> = {};
const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useSearch: () => mockSearch,
  useNavigate: () => mockNavigate,
  Link: ({
    children, to, params, search, ...rest
  }: {
    children: React.ReactNode;
    to?: string;
    params?: Record<string, string>;
    search?: Record<string, unknown>;
    [k: string]: unknown;
  }) => {
    const path = to && params
      ? Object.entries(params).reduce((acc, [k, v]) => acc.replace(`$${k}`, String(v)), to)
      : (to ?? '#');
    const qs = search ? `?${new URLSearchParams(
      Object.entries(search).reduce((acc, [k, v]) => {
        if (v != null) acc[k] = String(v);
        return acc;
      }, {} as Record<string, string>),
    ).toString()}` : '';
    return <a href={`${path}${qs}`} {...rest}>{children}</a>;
  },
}));

vi.mock('@/skins/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', user: null, isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => { server.resetHandlers(); mockSearch = {}; mockNavigate.mockReset(); });
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

async function mount() {
  const { default: Page } = await import('./audit');
  return renderWithProviders(<Page />);
}

function paged<T>(items: T[]) {
  return { items, total: items.length, per_page: 500, current_page: 1, last_page: 1 };
}


/** Requests to /reports/event-audit, for asserting the window bounds. */
let auditRequests: URLSearchParams[] = [];
function stubEndpoints() {
  auditRequests = [];
  server.use(
    http.get('/api/v3/monitors', () => HttpResponse.json(paged([
      { id: 1, name: 'Front Door', server_id: 2 }, { id: 2, name: 'Driveway East', server_id: null },
    ]))),
    http.get('/api/v3/servers', () => HttpResponse.json(paged([{ id: 2, name: 'edge-01', status: 'Running' }]))),
    http.get('/api/v3/groups', () => HttpResponse.json(paged([]))),
    http.get('/api/v3/groups-monitors', () => HttpResponse.json(paged([]))),
    // Shape as the dev box serves it; monitor 2 had no events, so no entry.
    http.get('/api/v3/reports/event-audit', ({ request }) => {
      const q = new URL(request.url).searchParams;
      auditRequests.push(q);
      return HttpResponse.json({
        start: q.get('start'),
        end: q.get('end'),
        monitors: [{
          monitor_id: 1, event_count: 3, first_event_id: 28876, last_event_id: 28888,
          first_start: '2026-08-21T06:40:00Z', last_end: '2026-08-21T07:05:00Z',
          min_gap_seconds: -2, max_gap_seconds: 600, missing_files: [28880], zero_size: [],
        }],
      });
    }),
  );
}

describe('AuditPage — classic skin', () => {
  it('shows Events / First / Last / MinGap / MaxGap and the file checks from the server audit', async () => {
    mockSearch = { min_time: '2026-08-21 06:37:03', max_time: '2026-08-21 07:37:03' };
    stubEndpoints();
    await mount();
    const row = await screen.findByTestId('audit-row-1');
    await waitFor(() => expect(within(row).getByRole('link', { name: '3' })).toBeInTheDocument());
    expect(within(row).getByText(/^28876 at /)).toBeInTheDocument();
    // The server reports when the last event ended, and says so.
    expect(within(row).getByText(/^28888 ended /)).toBeInTheDocument();
    expect(within(row).getByText('-2')).toBeInTheDocument();
    expect(within(row).getByText('600')).toBeInTheDocument();
    expect(within(row).getByText('edge-01')).toBeInTheDocument();
    const missing = within(row).getByTestId('audit-missing');
    expect(missing).toHaveClass('text-[#d9534f]');
    expect(within(missing).getByRole('link', { name: '1' })).toBeInTheDocument();
    expect(within(row).getByTestId('audit-zero-size')).toHaveTextContent('0');
    expect(within(row).getByTestId('audit-zero-size')).not.toHaveClass('text-[#d9534f]');
    const empty = screen.getByTestId('audit-row-2');
    await waitFor(() => expect(within(empty).getByRole('link', { name: '0' })).toBeInTheDocument());
    expect(within(empty).getAllByText('none')).toHaveLength(2);
    // One request, bounded by the window.
    expect(auditRequests).toHaveLength(1);
    expect(auditRequests[0].get('start')).toBe(new Date('2026-08-21T06:37:03').toISOString().replace(/\.\d{3}Z$/, 'Z'));
  });

  it('deep-links Id/Name to montage review, Events to the list and First/Last to the event', async () => {
    mockSearch = { min_time: '2026-08-21 06:37:03', max_time: '2026-08-21 07:37:03' };
    stubEndpoints();
    await mount();
    const row = await screen.findByTestId('audit-row-1');
    await waitFor(() => expect(within(row).getByRole('link', { name: '3' })).toBeInTheDocument());

    expect(within(row).getByRole('link', { name: 'Front Door' }).getAttribute('href'))
      .toBe('/montagereview?monitor_id=1&min_time=2026-08-21+06%3A37%3A03&max_time=2026-08-21+07%3A37%3A03');
    expect(within(row).getByRole('link', { name: '3' }).getAttribute('href'))
      .toBe('/events?monitor_id=1&start=2026-08-21T06%3A37%3A03&end=2026-08-21T07%3A37%3A03');
    expect(within(row).getByRole('link', { name: /^28876 at/ }).getAttribute('href')).toBe('/events/28876');
  });

  it('defaults the window to the hour that ended an hour ago', async () => {
    stubEndpoints();
    await mount();
    const start = await screen.findByLabelText('Window start') as HTMLInputElement;
    const end = screen.getByLabelText('Window end') as HTMLInputElement;
    const startMs = new Date(start.value).getTime();
    const endMs = new Date(end.value).getTime();
    expect(endMs - startMs).toBe(3_600_000);
    expect(Date.now() - endMs).toBeGreaterThan(3_500_000);
    expect(Date.now() - endMs).toBeLessThan(3_700_000);
  });

  it('renders the backend error instead of an empty table', async () => {
    server.use(
      http.get('/api/v3/monitors', () =>
        HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'monitors table locked' }, { status: 500 }),
      ),
      http.get('/api/v3/servers', () => HttpResponse.json(paged([]))),
      http.get('/api/v3/groups', () => HttpResponse.json(paged([]))),
      http.get('/api/v3/groups-monitors', () => HttpResponse.json(paged([]))),
    );
    await mount();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Cannot reach the server|Failed to load/);
    expect(screen.queryByTestId('audit-table')).toBeNull();
  });
});

/**
 * Integration-style tests for the audit page (classic skin): the legacy
 * per-monitor window semantic — Events / FirstEvent / LastEvent / MinGap /
 * MaxGap from each monitor's events inside the window — and its deep links.
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

const ev = (id: number, monitor_id: number, start: string, end: string) => ({
  id, monitor_id, name: `Event ${id}`, start_date_time: start, end_date_time: end, length: 30,
});

/** Requests to /events by monitor id, for asserting the window bounds. */
let eventRequests: URLSearchParams[] = [];

function stubEndpoints() {
  eventRequests = [];
  server.use(
    http.get('/api/v3/monitors', () => HttpResponse.json(paged([
      { id: 1, name: 'Front Door', server_id: 2 }, { id: 2, name: 'Driveway East', server_id: null },
    ]))),
    http.get('/api/v3/servers', () => HttpResponse.json(paged([{ id: 2, name: 'edge-01', status: 'Running' }]))),
    http.get('/api/v3/groups', () => HttpResponse.json(paged([]))),
    http.get('/api/v3/groups-monitors', () => HttpResponse.json(paged([]))),
    http.get('/api/v3/events', ({ request }) => {
      const q = new URL(request.url).searchParams;
      eventRequests.push(q);
      if (q.get('monitor_id') === '1') {
        return HttpResponse.json(paged([
          ev(28876, 1, '2026-08-21T06:40:00Z', '2026-08-21T06:45:00Z'),
          ev(28880, 1, '2026-08-21T06:47:00Z', '2026-08-21T06:50:00Z'),
          ev(28888, 1, '2026-08-21T07:00:00Z', '2026-08-21T07:05:00Z'),
        ]));
      }
      return HttpResponse.json(paged([]));
    }),
  );
}

describe('AuditPage — classic skin', () => {
  it('computes Events / First / Last / MinGap / MaxGap per monitor inside the window', async () => {
    mockSearch = { min_time: '2026-08-21 06:37:03', max_time: '2026-08-21 07:37:03' };
    stubEndpoints();
    await mount();
    const row = await screen.findByTestId('audit-row-1');
    await waitFor(() => expect(within(row).getByRole('link', { name: '3' })).toBeInTheDocument());

    expect(within(row).getByText(/^28876 at /)).toBeInTheDocument();
    expect(within(row).getByText(/^28888 at /)).toBeInTheDocument();
    expect(within(row).getByText('120')).toBeInTheDocument();   // min gap 06:45 → 06:47
    expect(within(row).getByText('600')).toBeInTheDocument();   // max gap 06:50 → 07:00
    expect(within(row).getByText('edge-01')).toBeInTheDocument();
    expect(within(row).getAllByText('needs zm-api#36')).toHaveLength(2);

    const empty = screen.getByTestId('audit-row-2');
    await waitFor(() => expect(within(empty).getByRole('link', { name: '0' })).toBeInTheDocument());
    expect(within(empty).getAllByText('none')).toHaveLength(2);

    // The window went to the backend as start/end bounds for every monitor.
    const req = eventRequests.find((q) => q.get('monitor_id') === '1')!;
    expect(req.get('start_time')).toBe(new Date('2026-08-21T06:37:03').toISOString().replace(/\.\d{3}Z$/, 'Z'));
    expect(req.get('sort')).toBe('start_time');
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

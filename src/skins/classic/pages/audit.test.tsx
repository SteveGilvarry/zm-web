/**
 * Integration-style tests for the audit page (classic skin). Same harness
 * as the Mission Control page test; asserts the legacy-style table renders
 * the same joined data.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children, to, search,
    ...rest
  }: {
    children: React.ReactNode;
    to?: string;
    search?: Record<string, unknown>;
    [k: string]: unknown;
  }) => {
    const qs = search ? `?${new URLSearchParams(
      Object.entries(search).reduce((acc, [k, v]) => {
        if (v != null) acc[k] = String(v);
        return acc;
      }, {} as Record<string, string>),
    ).toString()}` : '';
    return (
      <a href={`${to ?? '#'}${qs}`} {...rest}>
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
    accessToken: 'test', refreshToken: 'test', user: null, isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

async function mount() {
  const { default: Page } = await import('./audit');
  return renderWithProviders(<Page />);
}

function monitor(id: number, name: string) {
  return { id, name } as unknown as Record<string, unknown>;
}

function summary(
  monitor_id: number,
  total: number,
  hour = 0, day = 0, week = 0, month = 0, archived = 0,
) {
  return {
    monitor_id,
    total_events: total,    total_event_disk_space: total * 1024,
    hour_events: hour,      hour_event_disk_space: hour * 1024,
    day_events: day,        day_event_disk_space: day * 1024,
    week_events: week,      week_event_disk_space: week * 1024,
    month_events: month,    month_event_disk_space: month * 1024,
    archived_events: archived, archived_event_disk_space: archived * 1024,
  };
}

function stubEndpoints() {
  const mons = [monitor(2, 'Driveway East'), monitor(1, 'Front Door'), monitor(3, 'Garage')];
  const sums = [
    summary(1, 5000, 4, 87, 612, 2000, 25),
    summary(2,    0, 0,  0,   0,    0,  0),
    summary(3,   12, 0, 12,  12,   12,  0),
  ];
  server.use(
    http.get('/api/v3/monitors', () =>
      HttpResponse.json({
        items: mons, total: mons.length, per_page: 200, current_page: 1, last_page: 1,
      }),
    ),
    http.get('/api/v3/event-summaries', () =>
      HttpResponse.json({
        items: sums, total: sums.length, per_page: 200, current_page: 1, last_page: 1,
      }),
    ),
  );
}

describe('AuditPage — classic skin', () => {
  it('renders the classic table layout', async () => {
    stubEndpoints();
    await mount();
    await waitFor(() => expect(screen.getByText('Front Door')).toBeInTheDocument());

    // Heading is the classic-skin h1; the modern skin uses Panel's title h3 instead.
    expect(
      screen.getByRole('heading', { level: 1, name: /audit events report/i }),
    ).toBeInTheDocument();

    // Same data should be reachable in both skins.
    const row = screen.getByTestId('audit-row-1');
    expect(within(row).getByText('5000')).toBeInTheDocument();
  });

  it('keeps the archived-events breadcrumb and sortable headers', async () => {
    stubEndpoints();
    await mount();
    await waitFor(() => expect(screen.getByText('Front Door')).toBeInTheDocument());

    const link = screen.getByRole('link', { name: /browse archived events/i });
    expect(link.getAttribute('href')).toBe('/events?archived=true');
    expect(screen.getByText(/^monitor$/i).closest('th')?.getAttribute('aria-sort')).toBe('none');
    expect(screen.getByText(/^id$/i).closest('th')?.getAttribute('aria-sort')).toBe('ascending');
  });

  it('renders the backend error instead of an empty table', async () => {
    server.use(
      http.get('/api/v3/monitors', () =>
        HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'monitors table locked' }, { status: 500 }),
      ),
      http.get('/api/v3/event-summaries', () =>
        HttpResponse.json({ items: [], total: 0, per_page: 200, current_page: 1, last_page: 1 }),
      ),
    );
    await mount();
    const alert = await screen.findByTestId('audit-error');
    expect(alert.textContent).toMatch(/monitors table locked/);
    expect(screen.queryByTestId('audit-table')).toBeNull();
  });
});

/**
 * Integration-style tests for the audit page (Mission Control).
 *
 * Same harness pattern as groups: mock the router exports, stub
 * `<AppShell>` so we render just the page body, and back the data
 * fetches with MSW handlers.
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

/** Make a minimal Monitor shaped record (cast through unknown — the page
 * only reads id and name). */
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

const monitorsFixture = [
  monitor(2, 'Driveway East'),
  monitor(1, 'Front Door'),
  monitor(3, 'Garage'),
];

const summariesFixture = [
  summary(1, 5000, 4, 87, 612, 2000, 25),
  summary(2,    0, 0,  0,   0,    0,  0),
  summary(3,   12, 0, 12,  12,   12,  0),
];

function stubEndpoints(opts?: { monitors?: unknown[]; summaries?: unknown[] }) {
  const mons = opts?.monitors ?? monitorsFixture;
  const sums = opts?.summaries ?? summariesFixture;
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

describe('AuditPage — rendering', () => {
  it('renders one row per monitor with counts joined from event-summaries', async () => {
    stubEndpoints();
    await mount();

    await waitFor(() => {
      expect(screen.getByText('Front Door')).toBeInTheDocument();
    });
    expect(screen.getByText('Driveway East')).toBeInTheDocument();
    expect(screen.getByText('Garage')).toBeInTheDocument();

    // Front Door has 5000 total / 4 hour / 87 day — should all appear in its row.
    const row = screen.getByTestId('audit-row-1');
    expect(within(row).getByText('5000')).toBeInTheDocument();
    expect(within(row).getByText('4')).toBeInTheDocument();
    expect(within(row).getByText('87')).toBeInTheDocument();
  });

  it('renders a placeholder Files column with the v1-limitation tooltip', async () => {
    stubEndpoints();
    await mount();
    await waitFor(() => expect(screen.getByText('Front Door')).toBeInTheDocument());

    const row = screen.getByTestId('audit-row-1');
    const dash = within(row).getByText('—');
    expect(dash).toBeInTheDocument();
    expect(dash.getAttribute('title')).toMatch(/MissingFiles \/ ZeroSize/);
  });

  it('shows an empty state when no monitors are configured', async () => {
    stubEndpoints({ monitors: [], summaries: [] });
    await mount();
    await waitFor(() => {
      expect(screen.getByText(/no monitors configured/i)).toBeInTheDocument();
    });
  });
});

describe('AuditPage — breadcrumb to archived events', () => {
  it('renders a "Browse archived events" link pointing at /events?archived=true', async () => {
    stubEndpoints();
    await mount();
    await waitFor(() => expect(screen.getByText('Front Door')).toBeInTheDocument());

    const link = screen.getByRole('link', { name: /browse archived events/i });
    expect(link).toBeInTheDocument();
    expect(link.getAttribute('href')).toBe('/events?archived=true');
  });
});

describe('AuditPage — sort', () => {
  it('defaults to ascending by monitor ID', async () => {
    stubEndpoints();
    await mount();
    await waitFor(() => expect(screen.getByText('Front Door')).toBeInTheDocument());

    const rows = screen
      .getAllByRole('row')
      .filter((r) => r.parentElement?.tagName === 'TBODY');
    const names = rows.map(
      (r) => within(r).getAllByRole('link')[0]?.textContent?.trim(),
    );
    // Sorted by id ascending: 1=Front Door, 2=Driveway East, 3=Garage.
    expect(names).toEqual(['Front Door', 'Driveway East', 'Garage']);
  });

  it('clicking the Monitor header re-sorts alphabetically', async () => {
    stubEndpoints();
    const user = userEvent.setup();
    await mount();
    await waitFor(() => expect(screen.getByText('Front Door')).toBeInTheDocument());

    await user.click(screen.getByText(/^monitor$/i));

    const rows = screen
      .getAllByRole('row')
      .filter((r) => r.parentElement?.tagName === 'TBODY');
    const names = rows.map(
      (r) => within(r).getAllByRole('link')[0]?.textContent?.trim(),
    );
    expect(names).toEqual(['Driveway East', 'Front Door', 'Garage']);
  });

  it('clicking the same header twice toggles to descending', async () => {
    stubEndpoints();
    const user = userEvent.setup();
    await mount();
    await waitFor(() => expect(screen.getByText('Front Door')).toBeInTheDocument());

    await user.click(screen.getByText(/^total$/i));
    await user.click(screen.getByText(/^total$/i));

    const rows = screen
      .getAllByRole('row')
      .filter((r) => r.parentElement?.tagName === 'TBODY');
    // First link in each row is the monitor name; descending by total should
    // put 5000 → 12 → 0 in the order Front Door, Garage, Driveway East.
    const names = rows.map(
      (r) => within(r).getAllByRole('link')[0]?.textContent?.trim(),
    );
    expect(names).toEqual(['Front Door', 'Garage', 'Driveway East']);
  });
});

describe('AuditPage — footer totals', () => {
  it('sums each column across all visible rows', async () => {
    stubEndpoints();
    await mount();
    await waitFor(() => expect(screen.getByText('Front Door')).toBeInTheDocument());

    const totalsRow = screen.getByTestId('audit-totals');
    const text = totalsRow.textContent ?? '';

    // total: 5000 + 0 + 12 = 5012
    expect(text).toMatch(/5012/);
    // hour: 4 + 0 + 0 = 4   (single-digit; check by adjacent count cell)
    // day:  87 + 0 + 12 = 99
    expect(text).toMatch(/99/);
    // week: 612 + 0 + 12 = 624
    expect(text).toMatch(/624/);
    // month: 2000 + 0 + 12 = 2012
    expect(text).toMatch(/2012/);
    // archived: 25 + 0 + 0 = 25
    expect(text).toMatch(/25/);
  });
});

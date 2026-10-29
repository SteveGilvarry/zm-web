/**
 * Event audit through the real router.
 *
 * `audit.test.tsx` mounts the page against a stubbed router and pins the
 * per-monitor statistics from `/reports/event-audit`. This file drives the chrome that stub cannot
 * reach: the `?min_time` / `?max_time` window round-trip, the sortable
 * column headers, the refresh button, and the empty / error states.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw/http';

import { renderRoute } from '@/test/renderRoute';
import { setupMockServer, server, db } from '@/test/msw/server';
import { makeEvent, makeMonitor, makeServer } from '@/test/fixtures';

setupMockServer();

/**
 * `/reports/event-audit` from the seeded events, one entry per monitor that
 * has any (the shared handlers do not serve this report).
 */
beforeEach(() => {
  server.use(
    http.get('/api/v3/reports/event-audit', ({ request }) => {
      const q = new URL(request.url).searchParams;
      const byMonitor = new Map<number, number[]>();
      for (const e of db.events) byMonitor.set(e.monitor_id, [...(byMonitor.get(e.monitor_id) ?? []), e.id]);
      return HttpResponse.json({
        start: q.get('start'),
        end: q.get('end'),
        monitors: [...byMonitor].map(([monitor_id, ids]) => ({
          monitor_id, event_count: ids.length, first_event_id: Math.min(...ids), last_event_id: Math.max(...ids),
          first_start: '2026-08-20T01:00:00Z', last_end: '2026-08-20T01:30:00Z',
          min_gap_seconds: 0, max_gap_seconds: 0, missing_files: [], zero_size: [],
        })),
      });
    }),
  );
});

async function auditPage() {
  await screen.findAllByRole('heading', { name: /^Audit Events Report$/ });
  return screen.findByTestId('audit-table');
}

/** A local wall-clock string as the API timestamp the client sends. */
function apiStamp(local: string): string {
  return new Date(local).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Monitor ids in the order the table renders them. */
function rowIds(): string[] {
  return screen
    .getAllByTestId(/^audit-row-/)
    .map((row) => row.getAttribute('data-testid')!.replace('audit-row-', ''));
}

describe('Audit — rows', () => {
  it('counts each monitor’s events in the window and totals them', async () => {
    renderRoute('/audit');
    const table = await auditPage();

    const front = await screen.findByTestId('audit-row-1');
    expect(within(front).getByText('Front Door')).toBeInTheDocument();
    expect(within(table).getByTestId('audit-row-2')).toBeInTheDocument();

    // Seed: events 101 + 103 on monitor 1, event 102 on monitor 2.
    await waitFor(() =>
      expect(within(screen.getByTestId('audit-totals')).getByText('3')).toBeInTheDocument(),
    );
  });

  it('resolves the monitor’s server name from the servers list', async () => {
    db.servers = [makeServer({ id: 3, name: 'zm-node-3' })];
    db.monitors = [makeMonitor({ id: 1, name: 'Front Door', server_id: 3 })];
    renderRoute('/audit');
    await auditPage();
    expect(await screen.findByText('zm-node-3')).toBeInTheDocument();
  });

  it('shows the empty state when no monitor survives the filter', async () => {
    db.monitors = [];
    renderRoute('/audit');
    await screen.findAllByRole('heading', { name: /^Audit Events Report$/ });
    expect(await screen.findByText('No monitors match the filter.')).toBeInTheDocument();
  });

  it('shows the error state when the monitors request fails', async () => {
    server.use(http.get('/api/v3/monitors', () => new HttpResponse(null, { status: 500 })));
    renderRoute('/audit');
    await screen.findAllByRole('heading', { name: /^Audit Events Report$/ });
    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});

describe('Audit — time window', () => {
  it('reads the window out of the URL', async () => {
    // Legacy `YYYY-MM-DD HH:MM:SS` in the URL, `datetime-local` in the field.
    renderRoute('/audit?min_time=2026-08-20%2001%3A00%3A00&max_time=2026-08-20%2002%3A00%3A00');
    await auditPage();

    expect(screen.getByLabelText('Window start')).toHaveValue('2026-08-20T01:00');
    expect(screen.getByLabelText('Window end')).toHaveValue('2026-08-20T02:00');
  });

  it('writes a new start back into ?min_time, keeping the end', async () => {
    const { router } = renderRoute(
      '/audit?min_time=2026-08-20T01:00:00&max_time=2026-08-20T02:00:00',
    );
    await auditPage();

    fireEvent.change(screen.getByLabelText('Window start'), {
      target: { value: '2026-08-19T23:30' },
    });

    await waitFor(() =>
      expect(router.state.location.search).toEqual({
        min_time: '2026-08-19T23:30',
        max_time: '2026-08-20T02:00:00',
      }),
    );
    expect(screen.getByLabelText('Window start')).toHaveValue('2026-08-19T23:30');
  });

  it('writes a new end back into ?max_time', async () => {
    const { router } = renderRoute(
      '/audit?min_time=2026-08-20T01:00:00&max_time=2026-08-20T02:00:00',
    );
    await auditPage();

    fireEvent.change(screen.getByLabelText('Window end'), {
      target: { value: '2026-08-20T05:00' },
    });

    await waitFor(() =>
      expect(router.state.location.search).toEqual({
        min_time: '2026-08-20T01:00:00',
        max_time: '2026-08-20T05:00',
      }),
    );
  });

  it('bounds the audit request with the window', async () => {
    const seen: Array<{ start: string | null; end: string | null }> = [];
    server.use(
      http.get('/api/v3/reports/event-audit', ({ request }) => {
        const url = new URL(request.url);
        seen.push({ start: url.searchParams.get('start'), end: url.searchParams.get('end') });
        return HttpResponse.json({ start: '', end: '', monitors: [] });
      }),
    );
    db.monitors = [makeMonitor({ id: 7, name: 'Back Gate' })];

    renderRoute('/audit?min_time=2026-08-20T01:00:00&max_time=2026-08-20T02:00:00');
    await auditPage();

    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    // The field is local wall clock; the request carries the UTC instant.
    expect(seen[0].start).toBe(apiStamp('2026-08-20T01:00:00'));
    expect(seen[0].end).toBe(apiStamp('2026-08-20T02:00:00'));
  });

  it('refetches on demand', async () => {
    let calls = 0;
    server.use(
      http.get('/api/v3/monitors', () => {
        calls++;
        return HttpResponse.json({
          items: db.monitors, total: db.monitors.length,
          per_page: 200, current_page: 1, last_page: 1,
        });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/audit');
    await auditPage();
    await waitFor(() => expect(calls).toBe(1));

    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(calls).toBeGreaterThan(1));
  });
});

describe('Audit — sorting', () => {
  it('defaults to id ascending', async () => {
    renderRoute('/audit');
    await auditPage();
    await waitFor(() => expect(rowIds()).toEqual(['1', '2']));
    expect(screen.getByRole('columnheader', { name: 'Id' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
  });

  it('sorts by event count, then flips direction on a second click', async () => {
    const user = userEvent.setup();
    renderRoute('/audit');
    await auditPage();
    // Monitor 1 has two events, monitor 2 has one.
    await waitFor(() =>
      expect(within(screen.getByTestId('audit-totals')).getByText('3')).toBeInTheDocument(),
    );

    const events = screen.getByRole('columnheader', { name: 'Events' });
    await user.click(events);
    await waitFor(() => expect(rowIds()).toEqual(['2', '1']));
    expect(events).toHaveAttribute('aria-sort', 'ascending');
    expect(screen.getByRole('columnheader', { name: 'Id' })).toHaveAttribute(
      'aria-sort',
      'none',
    );

    await user.click(events);
    await waitFor(() => expect(rowIds()).toEqual(['1', '2']));
    expect(events).toHaveAttribute('aria-sort', 'descending');
  });

  it('sorts by name', async () => {
    db.monitors = [
      makeMonitor({ id: 1, name: 'Zebra' }),
      makeMonitor({ id: 2, name: 'Alpha' }),
    ];
    db.events = [makeEvent({ id: 1, monitor_id: 1 })];
    const user = userEvent.setup();
    renderRoute('/audit');
    await auditPage();
    await waitFor(() => expect(rowIds()).toEqual(['1', '2']));

    await user.click(screen.getByRole('columnheader', { name: 'Name' }));
    await waitFor(() => expect(rowIds()).toEqual(['2', '1']));
  });
});

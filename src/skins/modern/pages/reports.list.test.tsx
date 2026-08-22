/**
 * Route-level tests for the modern skin’s reports list (`/reports`).
 *
 * These go through the real router (`renderRoute`) and the shared MSW
 * handler set, so the route module, `SkinPage`, the modern shell, the
 * `RequirePerm` gates and every outgoing request are all exercised.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { toApiDateTime } from '@/features/reports/datetime';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { makeDateTimeFormatters } from '@/lib/datetime';

import { renderRoute } from '@/test/renderRoute';
import { setupMockServer, server, db } from '@/test/msw/server';
import { makeFilter, makeReport, paginated } from '@/test/fixtures';
import type { Report } from '@/api/reports';

setupMockServer();

afterEach(() => vi.restoreAllMocks());

/** The saved-reports table, once the lazy page chunk has painted. */
async function reportsTable() {
  return within(await screen.findByRole('table'));
}

describe('ReportsListPage — modern skin', () => {
  it('renders every saved report with its filter, range and interval', async () => {
    db.reports = [
      makeReport({ id: 1, name: 'Nightly', filter_id: 1, interval: 1440 }),
      makeReport({
        id: 2,
        name: null,
        filter_id: null,
        interval: null,
        start_date_time: null,
        end_date_time: null,
      }),
      makeReport({ id: 3, name: 'Orphaned', filter_id: 99, interval: 15 }),
    ];
    db.filters = [makeFilter({ id: 1, name: 'Recent motion' })];

    renderRoute('/reports');
    const table = await reportsTable();

    expect(
      table.getAllByRole('columnheader').map((th) => th.textContent),
    ).toEqual(['Name', 'Filter', 'Range', 'Interval', '']);

    // Name links to the detail route.
    expect(table.getByRole('link', { name: 'Nightly' })).toHaveAttribute(
      'href',
      '/reports/1',
    );
    // Report 1 resolves its filter id to the filter's name.
    const nightly = within(table.getByRole('link', { name: 'Nightly' }).closest('tr')!);
    expect(nightly.getByText('Recent motion')).toBeInTheDocument();
    expect(nightly.getByText('1440 min')).toBeInTheDocument();
    // Rendered through `useDateTimeFormat()` — with no server patterns set
    // that is Intl's medium date + 24h time in the viewer's zone, not the
    // page's old `toLocaleString()`.
    const { formatDateTime } = makeDateTimeFormatters({ locale: 'en' });
    const start = formatDateTime('2026-08-20T22:00:00Z');
    const end = formatDateTime('2026-08-21T06:00:00Z');
    expect(nightly.getByText(`${start} → ${end}`)).toBeInTheDocument();

    // Report 2 has no name, no filter, no range and no interval.
    expect(table.getByText('untitled')).toBeInTheDocument();
    expect(table.getByText('one-off')).toBeInTheDocument();
    expect(table.getByText('—', { selector: 'td > span' })).toBeInTheDocument();

    // Report 3 points at a filter that is not in the list — id fallback.
    expect(table.getByText('#99')).toBeInTheDocument();
  });

  it('shows the empty state when there are no reports', async () => {
    db.reports = [];
    renderRoute('/reports');

    expect(
      await screen.findByText('No reports yet. Create one to start.'),
    ).toBeVisible();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('surfaces a backend failure instead of an empty table', async () => {
    server.use(
      http.get('/api/v3/reports', () =>
        HttpResponse.json({ error_message: 'reports table locked' }, { status: 500 }),
      ),
    );
    renderRoute('/reports');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Cannot reach the server.');
    expect(screen.queryByRole('table')).toBeNull();
    expect(within(alert).getByRole('button', { name: 'Retry' })).toBeVisible();
  });

  it('hides New report and Delete without events Edit', async () => {
    renderRoute('/reports', { perms: { events: 'View' } });
    await reportsTable();

    expect(screen.queryByRole('button', { name: 'New report' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete report' })).toBeNull();
  });

  it('POSTs the create form, then closes it and refetches', async () => {
    db.reports = [makeReport({ id: 1, name: 'Nightly' })];
    db.filters = [makeFilter({ id: 1, name: 'Recent motion' })];
    const user = userEvent.setup();

    let body: Record<string, unknown> | undefined;
    server.use(
      http.post('/api/v3/reports', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        const created = makeReport({ id: 2, name: 'Weekend sweep' });
        db.reports = [...db.reports, created];
        return HttpResponse.json(created, { status: 201 });
      }),
    );

    renderRoute('/reports');
    await reportsTable();

    await user.click(screen.getByRole('button', { name: 'New report' }));
    const form = screen.getByRole('button', { name: 'Create report' }).closest('form')!;

    await user.type(within(form).getByPlaceholderText('Weekly motion report'), 'Weekend sweep');
    await user.selectOptions(within(form).getByRole('combobox'), '1');
    await user.type(within(form).getByPlaceholderText('minutes (blank = one-off)'), '30');
    await user.click(screen.getByRole('button', { name: 'Create report' }));

    await waitFor(() => expect(body).toBeDefined());
    expect(body!.name).toBe('Weekend sweep');
    expect(body!.filter_id).toBe(1);
    expect(body!.interval).toBe(30);
    // Defaults are "the last seven days", sent as full ISO timestamps.
    const startMs = Date.parse(body!.start_date_time as string);
    const endMs = Date.parse(body!.end_date_time as string);
    expect(Number.isNaN(startMs)).toBe(false);
    expect(Math.round((endMs - startMs) / 86_400_000)).toBe(7);

    // The form closes and the new row arrives from the refetch.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Create report' })).toBeNull(),
    );
    expect(await screen.findByRole('link', { name: 'Weekend sweep' })).toBeVisible();
  });

  it('sends a null name and null filter when the create form is left blank', async () => {
    const user = userEvent.setup();
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post('/api/v3/reports', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(makeReport({ id: 2 }), { status: 201 });
      }),
    );

    renderRoute('/reports');
    await reportsTable();

    await user.click(screen.getByRole('button', { name: 'New report' }));
    await user.click(screen.getByRole('button', { name: 'Create report' }));

    await waitFor(() => expect(body).toBeDefined());
    expect(body!.name).toBeNull();
    expect(body!.filter_id).toBeNull();
    expect(body!.interval).toBeNull();
  });

  // zm_api rejects fractional seconds ('400 Invalid start_date_time format'),
  // so the payload carries whole seconds — see toApiDateTime().
  it('sends the dates typed into the create form', async () => {
    const user = userEvent.setup();
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post('/api/v3/reports', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(makeReport({ id: 2 }), { status: 201 });
      }),
    );

    renderRoute('/reports');
    await reportsTable();
    await user.click(screen.getByRole('button', { name: 'New report' }));

    // The two range inputs carry no accessible name of their own — they sit
    // under the Start / End labels in source order.
    const form = screen.getByRole('button', { name: 'Create report' }).closest('form')!;
    const [start, end] = [
      ...form.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]'),
    ];
    fireEvent.change(start, { target: { value: '2026-07-01T08:00' } });
    fireEvent.change(end, { target: { value: '2026-07-08T20:30' } });
    expect(start).toHaveValue('2026-07-01T08:00');
    expect(end).toHaveValue('2026-07-08T20:30');

    await user.click(screen.getByRole('button', { name: 'Create report' }));

    await waitFor(() => expect(body).toBeDefined());
    // Whole seconds, no fractional part: zm_api answers 400 "Invalid
    // start_date_time format" for `…T08:00:00.000Z` (see toApiDateTime).
    expect(body!.start_date_time).toBe(toApiDateTime(new Date('2026-07-01T08:00')));
    expect(body!.end_date_time).toBe(toApiDateTime(new Date('2026-07-08T20:30')));
    expect(body!.start_date_time).not.toMatch(/\.\d{3}Z$/);
  });

  it('toggles the create panel closed again', async () => {
    const user = userEvent.setup();
    renderRoute('/reports');
    await reportsTable();

    await user.click(screen.getByRole('button', { name: 'New report' }));
    expect(screen.getByRole('button', { name: 'Create report' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'New report' }));
    expect(screen.queryByRole('button', { name: 'Create report' })).toBeNull();
  });

  it('DELETEs a report after confirming, and drops the row', async () => {
    db.reports = [
      makeReport({ id: 1, name: 'Nightly' }),
      makeReport({ id: 2, name: 'Weekend sweep' }),
    ];
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    const deleted: string[] = [];
    server.use(
      http.delete('/api/v3/reports/:id', ({ params }) => {
        deleted.push(String(params.id));
        db.reports = db.reports.filter((r: Report) => r.id !== Number(params.id));
        return HttpResponse.json({ message: 'deleted' });
      }),
    );

    renderRoute('/reports');
    const table = await reportsTable();

    const row = table.getByRole('link', { name: 'Nightly' }).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Delete report' }));

    expect(confirmSpy).toHaveBeenCalledWith('Delete report "Nightly"?');
    await waitFor(() => expect(deleted).toEqual(['1']));
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Nightly' })).toBeNull());
    expect(screen.getByRole('link', { name: 'Weekend sweep' })).toBeVisible();
  });

  it('does not delete when the confirm is dismissed', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    const deleted: string[] = [];
    server.use(
      http.delete('/api/v3/reports/:id', ({ params }) => {
        deleted.push(String(params.id));
        return HttpResponse.json({ message: 'deleted' });
      }),
    );

    renderRoute('/reports');
    const table = await reportsTable();
    await user.click(table.getAllByRole('button', { name: 'Delete report' })[0]);

    expect(confirmSpy).toHaveBeenCalled();
    expect(deleted).toEqual([]);
    expect(screen.getByRole('table')).toBeVisible();
  });

  it('reports a failed delete through a toast', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    server.use(
      http.delete('/api/v3/reports/:id', () =>
        HttpResponse.json({ error_message: 'report is referenced' }, { status: 409 }),
      ),
    );

    renderRoute('/reports');
    const table = await reportsTable();
    await user.click(table.getAllByRole('button', { name: 'Delete report' })[0]);

    expect(await screen.findByText(/report is referenced/i)).toBeVisible();
  });

  it('lists every saved filter as a create-form option', async () => {
    db.filters = [
      makeFilter({ id: 1, name: 'Recent motion' }),
      makeFilter({ id: 2, name: 'Overnight' }),
    ];
    server.use(
      http.get('/api/v3/filters', () => HttpResponse.json(paginated(db.filters))),
    );
    const user = userEvent.setup();

    renderRoute('/reports');
    await reportsTable();
    await user.click(screen.getByRole('button', { name: 'New report' }));

    const select = screen.getByRole('button', { name: 'Create report' })
      .closest('form')!
      .querySelector('select')!;
    expect([...select.options].map((o) => o.textContent)).toEqual([
      '— none —',
      'Recent motion',
      'Overnight',
    ]);
  });
});

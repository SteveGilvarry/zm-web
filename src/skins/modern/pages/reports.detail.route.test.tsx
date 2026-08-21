/**
 * Report detail through the real router.
 *
 * `reports.detail.test.tsx` mounts the page with a stubbed router and pins
 * the chart bucketing. This file drives the edit form itself — every field's
 * onChange and the PATCH body they add up to — plus the chart's loading /
 * no-filter / no-data returns, the delete confirm, and the `events: Edit`
 * gate.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { toApiDateTime } from '@/features/reports/datetime';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';

import { renderRoute } from '@/test/renderRoute';
import { setupMockServer, server, db } from '@/test/msw/server';
import { makeEvent, makeFilter, makeReport, paginated } from '@/test/fixtures';

setupMockServer();

afterEach(() => {
  vi.unstubAllGlobals();
});

async function reportPage() {
  await screen.findAllByRole('heading', { name: /^Report$/ });
  return screen.findByDisplayValue('Nightly');
}

/** Start / End are unlabelled `datetime-local` fields, in document order. */
function dateFields(): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]'));
}

describe('Report detail — load states', () => {
  it('fills the form from the saved report', async () => {
    renderRoute('/reports/1');
    await reportPage();

    expect(screen.getByRole('combobox')).toHaveValue('1');
    expect(screen.getByRole('spinbutton')).toHaveValue(1440);
    expect(dateFields()).toHaveLength(2);
  });

  it('shows the error state when the report request fails', async () => {
    server.use(http.get('/api/v3/reports/:id', () => new HttpResponse(null, { status: 500 })));
    renderRoute('/reports/1');
    await screen.findAllByRole('heading', { name: /^Report$/ });
    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('refuses to show a blank form for a report the backend does not have', async () => {
    // `useReportDetailPage` folds "loaded, but nothing came back" into
    // `isError`, so the empty branch never renders — the operator gets the
    // retry affordance rather than an editable form for a missing row.
    server.use(http.get('/api/v3/reports/:id', () => HttpResponse.json(null)));
    renderRoute('/reports/9');
    await screen.findAllByRole('heading', { name: /^Report$/ });
    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });

  it('links back to the reports list', async () => {
    renderRoute('/reports/1');
    await reportPage();
    expect(screen.getByRole('link', { name: /Back to reports/i })).toHaveAttribute(
      'href',
      '/reports',
    );
  });
});

describe('Report detail — edit form', () => {
  it('PATCHes every edited field in one save', async () => {
    db.filters = [
      makeFilter({ id: 1, name: 'Recent motion' }),
      makeFilter({ id: 4, name: 'Overnight' }),
    ];
    let body: Record<string, unknown> | null = null;
    server.use(
      http.patch('/api/v3/reports/:id', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(makeReport({ id: 1, name: 'Weekend' }));
      }),
    );

    const user = userEvent.setup();
    renderRoute('/reports/1');
    const name = await reportPage();

    await user.clear(name);
    await user.type(name, 'Weekend');
    await user.selectOptions(screen.getByRole('combobox'), '4');

    const [start, end] = dateFields();
    fireEvent.change(start, { target: { value: '2026-08-19T20:00' } });
    fireEvent.change(end, { target: { value: '2026-08-20T04:30' } });

    const interval = screen.getByRole('spinbutton');
    await user.clear(interval);
    await user.type(interval, '60');

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toEqual({
      name: 'Weekend',
      filter_id: 4,
      start_date_time: toApiDateTime(new Date('2026-08-19T20:00')),
      end_date_time: toApiDateTime(new Date('2026-08-20T04:30')),
      interval: 60,
    });
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
  });

  it('sends nulls for a cleared name, filter and interval', async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.patch('/api/v3/reports/:id', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(makeReport({ id: 1 }));
      }),
    );

    const user = userEvent.setup();
    renderRoute('/reports/1');
    const name = await reportPage();

    await user.clear(name);
    await user.selectOptions(screen.getByRole('combobox'), '');
    await user.clear(screen.getByRole('spinbutton'));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toMatchObject({ name: null, filter_id: null, interval: null });
  });

  it('reports a failed save', async () => {
    server.use(
      http.patch('/api/v3/reports/:id', () => new HttpResponse(null, { status: 500 })),
    );

    const user = userEvent.setup();
    renderRoute('/reports/1');
    await reportPage();

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Save failed. Try again.')).toBeInTheDocument();
  });

  it('asks before deleting, then DELETEs and returns to the list', async () => {
    let deleted: string | null = null;
    server.use(
      http.delete('/api/v3/reports/:id', ({ params }) => {
        deleted = String(params.id);
        return HttpResponse.json({ message: 'deleted' });
      }),
    );
    vi.stubGlobal('confirm', vi.fn(() => true));

    const user = userEvent.setup();
    const { router } = renderRoute('/reports/1');
    await reportPage();

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(confirm).toHaveBeenCalledWith('Delete report "Nightly"?');
    await waitFor(() => expect(deleted).toBe('1'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/reports'));
  });

  it('keeps the report when the delete confirm is dismissed', async () => {
    const deletes: string[] = [];
    server.use(
      http.delete('/api/v3/reports/:id', ({ params }) => {
        deletes.push(String(params.id));
        return HttpResponse.json({ message: 'deleted' });
      }),
    );
    vi.stubGlobal('confirm', vi.fn(() => false));

    const user = userEvent.setup();
    renderRoute('/reports/1');
    await reportPage();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(deletes).toEqual([]);
  });
});

describe('Report detail — chart', () => {
  it('buckets the linked filter’s matching events', async () => {
    db.filters = [
      makeFilter({
        id: 1,
        name: 'Recent motion',
        query_json: JSON.stringify({ terms: [{ attr: 'MonitorId', op: '=', val: '1' }] }),
      }),
    ];
    renderRoute('/reports/1');
    await reportPage();

    await waitFor(() =>
      expect(screen.queryByTestId('report-chart-no-data')).not.toBeInTheDocument(),
    );
    expect(screen.queryByTestId('report-chart-empty')).not.toBeInTheDocument();
    expect(await screen.findByText('Events per hour')).toBeInTheDocument();
  });

  it('waits with a spinner while the events are still arriving', async () => {
    server.use(
      http.get('/api/v3/events', async () => {
        await delay(60);
        return HttpResponse.json(paginated(db.events));
      }),
    );
    renderRoute('/reports/1');
    await reportPage();

    expect(await screen.findByText('Loading events…')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText('Loading events…')).not.toBeInTheDocument(),
    );
  });

  it('asks for a filter when the report has none', async () => {
    db.reports = [makeReport({ id: 1, name: 'Nightly', filter_id: null })];
    renderRoute('/reports/1');
    await reportPage();
    expect(await screen.findByTestId('report-chart-empty')).toBeInTheDocument();
  });

  it('drops back to the empty state when the filter is unset in the form', async () => {
    const user = userEvent.setup();
    renderRoute('/reports/1');
    await reportPage();

    await user.selectOptions(screen.getByRole('combobox'), '');
    expect(await screen.findByTestId('report-chart-empty')).toBeInTheDocument();
  });

  it('says there is nothing to chart when no recent event matches', async () => {
    db.events = [];
    renderRoute('/reports/1');
    await reportPage();
    expect(await screen.findByTestId('report-chart-no-data')).toBeInTheDocument();
  });

  it('says so when the linked filter cannot be read', async () => {
    server.use(
      http.get('/api/v3/filters/:id', () => new HttpResponse(null, { status: 500 })),
    );
    db.events = [makeEvent({ id: 1, monitor_id: 1 })];
    renderRoute('/reports/1');
    await reportPage();
    expect(await screen.findByText('Could not load filter #1.')).toBeInTheDocument();
  });
});

describe('Report detail — permissions', () => {
  it('hides Save and Delete from an operator with only View on events', async () => {
    renderRoute('/reports/1', { perms: { events: 'View' } });
    await reportPage();

    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    // The form itself is still readable.
    expect(screen.getByDisplayValue('Nightly')).toBeInTheDocument();
  });

  it('offers them to an operator with Edit', async () => {
    renderRoute('/reports/1');
    await reportPage();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
  });
});

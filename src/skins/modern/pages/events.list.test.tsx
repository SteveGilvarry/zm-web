/**
 * Route-level tests for the Mission Control events list (`/events`).
 *
 * `/events` carries the richest search-param contract in the app
 * (`monitor_id`, `group`, `cause`, `archived`, `start`, `end`, `notes`,
 * `tag`, `q`, `page`, `page_size`, `sort`, `dir`), so these tests drive it
 * through the real router in both directions: a URL in, and a control
 * click out.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { PaginatedResponse, ZmEvent } from '@/types';

import { renderRoute } from '@/test/renderRoute';
import { setupMockServer, server, db } from '@/test/msw/server';
import { makeEvent, makeGroupMonitor, makeTag, paginated } from '@/test/fixtures';

setupMockServer();

afterEach(() => vi.restoreAllMocks());

/**
 * Replace `/events` with a recording handler. Returns the array of request
 * URLs so a test can assert exactly what the page asked the API for.
 */
function recordEventQueries(
  envelope?: (rows: ZmEvent[]) => PaginatedResponse<ZmEvent>,
) {
  const urls: URL[] = [];
  server.use(
    http.get('/api/v3/events', ({ request }) => {
      const url = new URL(request.url);
      urls.push(url);
      const monitorId = url.searchParams.get('monitor_id');
      const rows = monitorId
        ? db.events.filter((e) => e.monitor_id === Number(monitorId))
        : db.events;
      return HttpResponse.json(envelope ? envelope(rows) : paginated(rows));
    }),
  );
  return urls;
}

/**
 * One event card, located through its per-row download link — the only
 * element in the card with a stable accessible name — then widened to the
 * card element that link sits in.
 */
/**
 * One event's row. The list renders a table by default now (docs/DESIGN.md);
 * the per-event download link is still the anchor that identifies it.
 */
function row(id: number) {
  const link = screen.getByRole('link', { name: `Download video for event ${id}` });
  return within(link.closest('tr') ?? link.parentElement!);
}

/** Wait for the list to paint. */
async function rows() {
  return screen.findByRole('link', { name: 'Download video for event 101' });
}

describe('EventsListPage — modern skin', () => {
  it('renders one row per event with monitor, cause, counts and archive state', async () => {
    renderRoute('/events');
    await rows();

    expect(screen.getByText('Showing 3 of 3 events')).toBeVisible();

    const front = row(101);
    expect(front.getByText('Event-101')).toBeVisible();
    expect(front.getByText('101')).toBeVisible();
    expect(front.getByText('Front Door')).toBeVisible();
    expect(front.getByText('Motion')).toBeVisible();
    expect(front.getByText('9000')).toBeVisible();   // frames
    expect(front.getByText('120')).toBeVisible();    // alarm frames
    expect(front.queryByLabelText('Archived')).toBeNull();

    // 102 lives on monitor 2 and is archived — the row carries the mark.
    const drive = row(102);
    expect(drive.getByText('Driveway')).toBeVisible();
    expect(drive.getByText('Forced Web')).toBeVisible();
    expect(drive.getByLabelText('Archived')).toBeVisible();

    // Footer totals sum the visible page (600 + 13 + 600 s, 3 × 40 MB).
    expect(screen.getByTestId('modern-total-duration')).toHaveTextContent('Σ Duration 20:13');
    expect(screen.getByTestId('modern-total-disk')).toHaveTextContent('Σ Disk 120 MB');

    // Every card links to its event, and the video href carries the token.
    expect(
      screen.getByRole('link', { name: 'Download video for event 103' }),
    ).toHaveAttribute('href', expect.stringContaining('/events/103/video?token='));
  });

  it('seeds the last hour on a plain landing and clears it on request', async () => {
    const urls = recordEventQueries();
    const user = userEvent.setup();
    renderRoute('/events');
    await rows();

    const hint = screen.getByTestId('default-hour-hint');
    expect(hint).toHaveTextContent('Showing events from the last hour only');

    await waitFor(() => expect(urls).toHaveLength(1));
    const seeded = urls[0].searchParams.get('start_time')!;
    // Full ISO with seconds and Z — the backend's parser is strict.
    expect(seeded).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    const ageMinutes = (Date.now() - Date.parse(seeded)) / 60_000;
    expect(ageMinutes).toBeGreaterThan(59);
    expect(ageMinutes).toBeLessThan(61);

    await user.click(within(hint).getByRole('button', { name: 'Clear' }));
    expect(screen.queryByTestId('default-hour-hint')).toBeNull();
    await waitFor(() => expect(urls.at(-1)!.searchParams.get('start_time')).toBeNull());
  });

  it('does not seed the last hour when the URL already names a filter', async () => {
    const urls = recordEventQueries();
    renderRoute('/events?monitor_id=1');
    await rows();

    expect(screen.queryByTestId('default-hour-hint')).toBeNull();
    await waitFor(() => expect(urls).toHaveLength(1));
    expect(urls[0].searchParams.get('start_time')).toBeNull();
  });

  it('shows the empty state when nothing matches', async () => {
    db.events = [];
    renderRoute('/events');

    expect(await screen.findByText('No events found')).toBeVisible();
    expect(screen.getByText('Try adjusting your filters')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Export visible events as CSV' })).toBeDisabled();
  });

  it('surfaces a backend failure instead of an empty list', async () => {
    server.use(
      http.get('/api/v3/events', () =>
        HttpResponse.json({ error_message: 'events table locked' }, { status: 500 }),
      ),
    );
    renderRoute('/events');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Cannot reach the server.');
    expect(screen.queryByRole('link', { name: /Download video/ })).toBeNull();
  });

  /* ------------------------------------------------------------------ */
  /*  URL → UI                                                          */
  /* ------------------------------------------------------------------ */

  it('sends every URL filter through to the API', async () => {
    const urls = recordEventQueries((rows) =>
      paginated(rows, { total: 60, per_page: 5, current_page: 2 }),
    );
    renderRoute(
      '/events?monitor_id=2&archived=true&sort=max_score&dir=desc' +
        '&page=2&page_size=5&start=2026-08-01T00:00&end=2026-08-02T12:30',
    );
    await screen.findByRole('link', { name: 'Download video for event 102' });

    await waitFor(() => expect(urls).toHaveLength(1));
    const q = urls[0].searchParams;
    expect(q.get('monitor_id')).toBe('2');
    expect(q.get('archived')).toBe('true');
    expect(q.get('sort')).toBe('max_score');
    expect(q.get('direction')).toBe('desc');
    expect(q.get('page')).toBe('2');
    expect(q.get('page_size')).toBe('5');
    // Local wall-clock in the URL, full ISO on the wire.
    expect(q.get('start_time')).toBe(new Date('2026-08-01T00:00').toISOString().replace(/\.\d{3}Z$/, 'Z'));
    expect(q.get('end_time')).toBe(new Date('2026-08-02T12:30').toISOString().replace(/\.\d{3}Z$/, 'Z'));
  });

  it('reflects the URL in every filter control', async () => {
    db.tags = [makeTag({ id: 1, name: 'Important' })];
    renderRoute('/events?monitor_id=2&cause=Forced%20Web&q=Event&page_size=5&sort=id&dir=desc&group=1');
    await screen.findByRole('link', { name: 'Download video for event 102' });

    expect(screen.getByRole('combobox', { name: 'Monitor' })).toHaveValue('2');
    // An <input list=…> is a combobox, not a textbox.
    expect(screen.getByRole('combobox', { name: 'Cause' })).toHaveValue('Forced Web');
    expect(screen.getByRole('combobox', { name: 'Group' })).toHaveValue('1');
    expect(screen.getByRole('combobox', { name: 'Events per page' })).toHaveValue('5');
    expect(screen.getByRole('textbox', { name: 'Name contains' })).toHaveValue('Event');
    expect(screen.getByRole('button', { name: 'Id, sorted descending' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('sends the notes substring to the server and shows only what came back', async () => {
    const urls = recordEventQueries();
    renderRoute('/events?notes=delivery');
    await screen.findByRole('link', { name: 'Download video for event 103' });

    expect(screen.getByRole('textbox', { name: 'Notes contain' })).toHaveValue('delivery');
    await waitFor(() => expect(urls.at(-1)!.searchParams.get('notes')).toBe('delivery'));
    // No "within this page" caveat: the total is the filtered total.
    expect(screen.queryByText(/within this page/)).toBeNull();
  });

  it('sends the tag filter as tag_id', async () => {
    db.tags = [makeTag({ id: 1, name: 'Important' }), makeTag({ id: 2, name: 'Review' })];
    db.events = [
      makeEvent({ id: 101, monitor_id: 1, tags: [{ id: 1, name: 'Important' }] }),
      makeEvent({ id: 102, monitor_id: 1, tags: null }),
    ];
    const urls = recordEventQueries();
    renderRoute('/events?tag=1');
    await rows();

    expect(screen.getByRole('combobox', { name: 'Tag' })).toHaveValue('1');
    await waitFor(() => expect(urls.at(-1)!.searchParams.get('tag_id')).toBe('1'));
    // Tag counts ride along in the option label.
    expect(screen.getByRole('option', { name: 'Important (3)' })).toBeInTheDocument();
  });

  it('runs a group filter through /filters/preview with the group monitors', async () => {
    db.groupMonitors = [
      makeGroupMonitor({ id: 1, group_id: 1, monitor_id: 1 }),
      makeGroupMonitor({ id: 2, group_id: 1, monitor_id: 2 }),
      makeGroupMonitor({ id: 3, group_id: 2, monitor_id: 2 }),
    ];
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post('/api/v3/filters/preview', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(paginated(db.events));
      }),
    );

    renderRoute('/events?group=1&archived=false');
    await rows();

    await waitFor(() => expect(body).toBeDefined());
    expect(body).toEqual({
      where: {
        match: 'all',
        rules: [
          { field: 'monitor_id', op: 'in', value: [1, 2] },
          { field: 'archived', op: 'eq', value: 0 },
        ],
      },
      sort: { field: 'start_time', dir: 'asc' },
    });
  });

  it('shows nothing for a group with no monitors, without calling the API', async () => {
    db.groupMonitors = [];
    let previewed = 0;
    server.use(
      http.post('/api/v3/filters/preview', () => {
        previewed += 1;
        return HttpResponse.json(paginated([]));
      }),
    );

    renderRoute('/events?group=1');
    expect(await screen.findByText('No events found')).toBeVisible();
    expect(screen.getByText('Showing 0 of 0 events')).toBeVisible();
    expect(previewed).toBe(0);
  });

  it('seeds the saved-filter link with the active conditions', async () => {
    renderRoute('/events?monitor_id=2&archived=true&notes=van');
    // No event on this page has "van" in its notes, so the list is empty —
    // the seeded link is built from the URL, not from the rows.
    await screen.findByRole('link', { name: 'Filter' });

    const href = screen.getByRole('link', { name: 'Filter' }).getAttribute('href')!;
    const url = new URL(href, 'http://localhost');
    expect(url.pathname).toBe('/filters');

    // The router serialises the search value, so the param is a JSON string
    // that itself holds the JSON terms array.
    let terms: unknown = url.searchParams.get('terms');
    while (typeof terms === 'string') terms = JSON.parse(terms);

    expect(terms).toEqual([
      { obr: '0', attr: 'MonitorId', op: '=', val: '2', cbr: '0' },
      { cnj: 'and', obr: '0', attr: 'Notes', op: 'LIKE', val: 'van', cbr: '0' },
      { cnj: 'and', obr: '0', attr: 'Archived', op: '=', val: '1', cbr: '0' },
    ]);
  });

  /* ------------------------------------------------------------------ */
  /*  UI → URL                                                          */
  /* ------------------------------------------------------------------ */

  it('writes the monitor, cause, tag and group filters back to the URL', async () => {
    const user = userEvent.setup();
    const { router } = renderRoute('/events');
    await rows();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Monitor' }), '2');
    await waitFor(() => expect(router.state.location.search).toEqual({ monitor_id: 2 }));

    await user.type(screen.getByRole('combobox', { name: 'Cause' }), 'Forced Web');
    await waitFor(
      () => expect(router.state.location.search).toEqual({ monitor_id: 2, cause: 'Forced Web' }),
      { timeout: 3000 },
    );

    await user.selectOptions(screen.getByRole('combobox', { name: 'Tag' }), '1');
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ tag: 1 }),
    );

    await user.selectOptions(screen.getByRole('combobox', { name: 'Group' }), '1');
    await waitFor(() => expect(router.state.location.search).toMatchObject({ group: 1 }));

    // "All" on each select (and an empty Cause box) removes the param again.
    await user.selectOptions(screen.getByRole('combobox', { name: 'Monitor' }), 'all');
    await user.clear(screen.getByRole('combobox', { name: 'Cause' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Tag' }), 'all');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Group' }), 'all');
    await waitFor(() => expect(router.state.location.search).toEqual({}), { timeout: 3000 });
  });

  it('cycles the archived toggle through the URL', async () => {
    const user = userEvent.setup();
    const { router } = renderRoute('/events');
    await rows();

    await user.click(screen.getByRole('button', { name: 'Archived' }));
    await waitFor(() => expect(router.state.location.search).toEqual({ archived: true }));

    await user.click(screen.getByRole('button', { name: 'Unarchived' }));
    await waitFor(() => expect(router.state.location.search).toEqual({ archived: false }));

    await user.click(screen.getByRole('button', { name: 'All' }));
    await waitFor(() => expect(router.state.location.search).toEqual({}));
  });

  it('toggles sort field and direction from the sort bar', async () => {
    const user = userEvent.setup();
    const { router } = renderRoute('/events');
    await rows();

    // start_time / ascending is the default from ZM_WEB_EVENT_SORT_*.
    expect(screen.getByRole('button', { name: 'Start, sorted ascending' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'Sort by Max score' }));
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ sort: 'max_score', dir: 'asc' }),
    );

    // Same field again flips the direction.
    await user.click(screen.getByRole('button', { name: 'Max score, sorted ascending' }));
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ sort: 'max_score', dir: 'desc' }),
    );
  });

  it('offers the sort fields zm-api#20 added and sends them to the API', async () => {
    const urls = recordEventQueries();
    const user = userEvent.setup();
    const { router } = renderRoute('/events');
    await rows();

    // The table sorts by the columns it shows; `notes` has no column, so it
    // is reachable through the URL (`?sort=notes`) rather than a header.
    for (const [label, field] of [
      ['Name', 'name'], ['Cause', 'cause'], ['Monitor', 'monitor_id'],
      ['Frames', 'frames'],
    ] as const) {
      await user.click(screen.getByRole('button', { name: `Sort by ${label}` }));
      await waitFor(() => expect(router.state.location.search).toMatchObject({ sort: field }));
      await waitFor(() => expect(urls.at(-1)!.searchParams.get('sort')).toBe(field));
    }
  });

  it('debounces the free-text boxes into the URL', async () => {
    const user = userEvent.setup();
    const { router } = renderRoute('/events');
    await rows();

    await user.type(screen.getByRole('textbox', { name: 'Name contains' }), 'Event-102');
    await waitFor(
      () => expect(router.state.location.search).toMatchObject({ q: 'Event-102' }),
      { timeout: 3000 },
    );

    await user.type(screen.getByRole('textbox', { name: 'Notes contain' }), 'van');
    await waitFor(
      () => expect(router.state.location.search).toMatchObject({ q: 'Event-102', notes: 'van' }),
      { timeout: 3000 },
    );
  });

  it('writes the date bounds and the page size, then resets everything', async () => {
    const user = userEvent.setup();
    const { router } = renderRoute('/events');
    await rows();

    const after = screen.getByLabelText('Events starting after');
    await user.clear(after);
    await user.type(after, '2026-08-01T09:30');
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ start: '2026-08-01T09:30' }),
    );

    await user.type(screen.getByLabelText('Events starting before'), '2026-08-02T18:00');
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ end: '2026-08-02T18:00' }),
    );

    await user.selectOptions(screen.getByRole('combobox', { name: 'Events per page' }), '50');
    await waitFor(() => expect(router.state.location.search).toMatchObject({ page_size: 50 }));

    await user.click(screen.getByRole('button', { name: 'Reset filters' }));
    // Reset clears the filters but leaves the page size and sort alone.
    await waitFor(() => expect(router.state.location.search).toEqual({ page_size: 50 }));
    expect(screen.queryByTestId('default-hour-hint')).toBeNull();
  });

  it('refetches on demand', async () => {
    const urls = recordEventQueries();
    const user = userEvent.setup();
    renderRoute('/events');
    await rows();
    await waitFor(() => expect(urls).toHaveLength(1));

    await user.click(screen.getByRole('button', { name: 'Refresh events' }));
    await waitFor(() => expect(urls.length).toBeGreaterThan(1));
  });

  /* ------------------------------------------------------------------ */
  /*  Paging                                                            */
  /* ------------------------------------------------------------------ */

  it('pages through the URL and keeps the pager in step', async () => {
    const urls = recordEventQueries((rows) => paginated(rows, { total: 75, per_page: 25 }));
    const user = userEvent.setup();
    const { router } = renderRoute('/events');
    await rows();

    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Go to page 1' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await user.click(screen.getByRole('button', { name: 'Go to page 2' }));
    await waitFor(() => expect(router.state.location.search).toEqual({ page: 2 }));
    await waitFor(() => expect(urls.at(-1)!.searchParams.get('page')).toBe('2'));

    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(router.state.location.search).toEqual({ page: 3 }));
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Previous page' }));
    await waitFor(() => expect(router.state.location.search).toEqual({ page: 2 }));

    // Page 1 is the default, so it leaves the URL rather than being written.
    await user.click(screen.getByRole('button', { name: 'Go to page 1' }));
    await waitFor(() => expect(router.state.location.search).toEqual({}));
  });

  it('jumps to a page from the numeric box and ignores out-of-range values', async () => {
    recordEventQueries((rows) => paginated(rows, { total: 75, per_page: 25 }));
    const user = userEvent.setup();
    const { router } = renderRoute('/events');
    await rows();

    // The pager unmounts while the next page is in flight, so re-query it.
    const jump = () => screen.getByRole('spinbutton', { name: 'Jump to page' });
    expect(jump()).toHaveValue(1);

    await user.clear(jump());
    await user.type(jump(), '3');
    await user.click(screen.getByRole('button', { name: 'Go' }));
    await waitFor(() => expect(router.state.location.search).toEqual({ page: 3 }));
    await waitFor(() => expect(jump()).toHaveValue(3));

    // 9 is past the last page — the box snaps back and the URL is untouched.
    await user.clear(jump());
    await user.type(jump(), '9');
    await user.click(screen.getByRole('button', { name: 'Go' }));
    expect(jump()).toHaveValue(3);
    expect(router.state.location.search).toEqual({ page: 3 });
  });

  it('slides the five-page window around the current page', async () => {
    recordEventQueries((rows) => paginated(rows, { total: 250, per_page: 25 }));
    const user = userEvent.setup();
    const { router } = renderRoute('/events?page=5');
    await rows();

    // Middle of a ten-page set: the window centres on the current page.
    expect(
      screen.getAllByRole('button', { name: /^Go to page / })
        .map((b) => b.textContent),
    ).toEqual(['3', '4', '5', '6', '7']);
    expect(screen.getByText('of 10')).toBeVisible();

    // Near the end it pins to the last five instead of running past 10.
    await user.click(screen.getByRole('button', { name: 'Go to page 7' }));
    await waitFor(() => expect(router.state.location.search).toEqual({ page: 7 }));
    await waitFor(() =>
      expect(
        screen.getAllByRole('button', { name: /^Go to page / })
          .map((b) => b.textContent),
      ).toEqual(['5', '6', '7', '8', '9']),
    );

    await user.click(screen.getByRole('button', { name: 'Go to page 9' }));
    await waitFor(() =>
      expect(
        screen.getAllByRole('button', { name: /^Go to page / })
          .map((b) => b.textContent),
      ).toEqual(['6', '7', '8', '9', '10']),
    );
  });

  it('hides the pager when everything fits on one page', async () => {
    renderRoute('/events');
    await rows();
    expect(screen.queryByRole('button', { name: 'Next page' })).toBeNull();
    expect(screen.queryByRole('spinbutton', { name: 'Jump to page' })).toBeNull();
  });

  /* ------------------------------------------------------------------ */
  /*  Selection, bulk mutations and permissions                         */
  /* ------------------------------------------------------------------ */

  it('keeps the bulk bar hidden until a row is selected', async () => {
    const user = userEvent.setup();
    renderRoute('/events');
    await rows();

    expect(screen.queryByRole('region', { name: 'Bulk event actions' })).toBeNull();

    await user.click(row(101).getByRole('checkbox', { name: /^Select event/ }));
    const bar = within(screen.getByRole('region', { name: 'Bulk event actions' }));
    expect(bar.getByText('1 selected')).toBeVisible();
    // A checkbox announces its own state, so the label stays constant.
    expect(row(101).getByRole('checkbox', { name: /^Select event/ })).toBeChecked();

    await user.click(bar.getByRole('button', { name: 'Clear selection' }));
    expect(screen.queryByRole('region', { name: 'Bulk event actions' })).toBeNull();
  });

  it('archives the selection one PATCH at a time', async () => {
    const user = userEvent.setup();
    const seen: Array<{ id: string; body: unknown }> = [];
    server.use(
      http.patch('/api/v3/events/:id', async ({ request, params }) => {
        seen.push({ id: String(params.id), body: await request.json() });
        return HttpResponse.json(makeEvent({ id: Number(params.id), archived: 1 }));
      }),
    );

    renderRoute('/events');
    await rows();
    await user.click(row(101).getByRole('checkbox', { name: /^Select event/ }));
    await user.click(row(103).getByRole('checkbox', { name: /^Select event/ }));

    const bar = within(screen.getByRole('region', { name: 'Bulk event actions' }));
    expect(bar.getByText('2 selected')).toBeVisible();
    await user.click(bar.getByRole('button', { name: 'Archive' }));

    await waitFor(() => expect(seen).toHaveLength(2));
    expect(seen).toEqual([
      { id: '101', body: { archived: true } },
      { id: '103', body: { archived: true } },
    ]);
    // A clean run clears the selection and puts the bar away.
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Bulk event actions' })).toBeNull(),
    );
  });

  it('unarchives with archived:false', async () => {
    const user = userEvent.setup();
    const bodies: unknown[] = [];
    server.use(
      http.patch('/api/v3/events/:id', async ({ request, params }) => {
        bodies.push(await request.json());
        return HttpResponse.json(makeEvent({ id: Number(params.id) }));
      }),
    );

    renderRoute('/events');
    await rows();
    await user.click(row(102).getByRole('checkbox', { name: /^Select event/ }));
    await user.click(
      within(screen.getByRole('region', { name: 'Bulk event actions' }))
        .getByRole('button', { name: 'Unarchive' }),
    );

    await waitFor(() => expect(bodies).toEqual([{ archived: false }]));
  });

  it('deletes the selection after confirming', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    const deleted: string[] = [];
    server.use(
      http.delete('/api/v3/events/:id', ({ params }) => {
        deleted.push(String(params.id));
        db.events = db.events.filter((e) => e.id !== Number(params.id));
        return HttpResponse.json({ message: 'deleted' });
      }),
    );

    renderRoute('/events');
    await rows();
    await user.click(row(101).getByRole('checkbox', { name: /^Select event/ }));
    await user.click(
      within(screen.getByRole('region', { name: 'Bulk event actions' }))
        .getByRole('button', { name: 'Delete' }),
    );

    expect(confirmSpy).toHaveBeenCalledWith("Delete 1 event? This can't be undone.");
    await waitFor(() => expect(deleted).toEqual(['101']));
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Download video for event 101' })).toBeNull(),
    );
  });

  it('does not delete when the confirm is dismissed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    let deletes = 0;
    server.use(
      http.delete('/api/v3/events/:id', () => {
        deletes += 1;
        return HttpResponse.json({ message: 'deleted' });
      }),
    );

    renderRoute('/events');
    await rows();
    await user.click(row(101).getByRole('checkbox', { name: /^Select event/ }));
    await user.click(
      within(screen.getByRole('region', { name: 'Bulk event actions' }))
        .getByRole('button', { name: 'Delete' }),
    );

    expect(deletes).toBe(0);
    expect(screen.getByRole('region', { name: 'Bulk event actions' })).toBeVisible();
  });

  it('reports the ids a bulk action could not update', async () => {
    const user = userEvent.setup();
    server.use(
      http.patch('/api/v3/events/:id', () =>
        HttpResponse.json({ error_message: 'event is locked' }, { status: 409 }),
      ),
    );

    renderRoute('/events');
    await rows();
    await user.click(row(101).getByRole('checkbox', { name: /^Select event/ }));
    await user.click(
      within(screen.getByRole('region', { name: 'Bulk event actions' }))
        .getByRole('button', { name: 'Archive' }),
    );

    const failures = await screen.findByTestId('bulk-failures');
    expect(failures).toHaveTextContent('Archive: 0 of 1 succeeded');
    expect(failures).toHaveTextContent('#101');
  });

  it('PATCHes only the fields the bulk edit form filled in', async () => {
    const user = userEvent.setup();
    const bodies: unknown[] = [];
    server.use(
      http.patch('/api/v3/events/:id', async ({ request, params }) => {
        bodies.push(await request.json());
        return HttpResponse.json(makeEvent({ id: Number(params.id) }));
      }),
    );

    renderRoute('/events');
    await rows();
    await user.click(row(101).getByRole('checkbox', { name: /^Select event/ }));
    await user.click(
      within(screen.getByRole('region', { name: 'Bulk event actions' }))
        .getByRole('button', { name: 'Edit' }),
    );

    const form = screen.getByTestId('event-edit-form');
    await user.type(within(form).getByRole('textbox', { name: 'Event cause' }), 'Manual');
    await user.click(within(form).getByRole('radio', { name: 'Archive' }));
    await user.click(within(form).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(bodies).toEqual([{ cause: 'Manual', archived: true }]));
  });

  it('hides every editing action from a view-only operator', async () => {
    const user = userEvent.setup();
    renderRoute('/events', { perms: { events: 'View' } });
    await rows();

    await user.click(row(101).getByRole('checkbox', { name: /^Select event/ }));
    const bar = within(screen.getByRole('region', { name: 'Bulk event actions' }));

    // Read-only actions stay.
    expect(bar.getByRole('button', { name: 'View' })).toBeVisible();
    expect(bar.getByRole('button', { name: 'Download' })).toBeVisible();
    // Everything that writes is gone.
    expect(bar.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(bar.queryByRole('button', { name: 'Archive' })).toBeNull();
    expect(bar.queryByRole('button', { name: 'Unarchive' })).toBeNull();
    expect(bar.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('opens the first selected event from the bulk View button', async () => {
    const user = userEvent.setup();
    const { router } = renderRoute('/events');
    await rows();

    await user.click(row(103).getByRole('checkbox', { name: /^Select event/ }));
    await user.click(
      within(screen.getByRole('region', { name: 'Bulk event actions' }))
        .getByRole('button', { name: 'View' }),
    );

    await waitFor(() => expect(router.state.location.pathname).toBe('/events/103'));
  });

  /* ------------------------------------------------------------------ */
  /*  Columns and export                                                */
  /* ------------------------------------------------------------------ */

  it('exports the visible page as CSV', async () => {
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:zm');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    const user = userEvent.setup();

    renderRoute('/events');
    await rows();
    await user.click(screen.getByRole('button', { name: 'Export visible events as CSV' }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0];
    await expect(blob.text()).resolves.toContain('Event-101');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:zm');
  });

  it('opens the column chooser from the toolbar', async () => {
    const user = userEvent.setup();
    renderRoute('/events');
    await rows();

    const columns = screen.getByRole('button', { name: /^Columns/ });
    expect(columns).toHaveAttribute('aria-expanded', 'false');
    await user.click(columns);
    expect(columns).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu')).toBeVisible();
  });
});

/**
 * Route-level tests for the modern skin’s per-frame table
 * (`/events/$eventId/frames`, legacy `?view=frames&eid=`).
 *
 * Everything runs through the real router, so `validateSearch`, the page
 * size / page URL round-trip and the outgoing `/frames` query are all real.
 */
import { describe, expect, it } from 'vitest';
import { configListHandler } from '@/test/msw/handlers';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import { renderRoute } from '@/test/renderRoute';
import { setupMockServer, server, db } from '@/test/msw/server';
import { makeEvent, makeFrame, makeZone, paginated } from '@/test/fixtures';

setupMockServer();

/** Capture every `/api/v3/frames` request the page makes. */
function recordFrameQueries(response: () => Response) {
  const urls: URL[] = [];
  server.use(
    http.get('/api/v3/frames', ({ request }) => {
      urls.push(new URL(request.url));
      return response();
    }),
  );
  return urls;
}

describe('EventFramesPage — modern skin', () => {
  it('renders the legacy column set and one row per frame', async () => {
    db.events = [makeEvent({ id: 101, monitor_id: 1, name: 'Event-101' })];
    db.frames = [
      makeFrame({ id: 1, event_id: 101, frame_id: 1, delta: '0.00' }),
      makeFrame({ id: 2, event_id: 101, frame_id: 2, type: 'Alarm', score: 88, delta: '1.50' }),
      makeFrame({ id: 3, event_id: 101, frame_id: 3, score: 22, delta: '2.25' }),
    ];

    renderRoute('/events/101/frames');
    const table = within(await screen.findByTestId('frames-table'));

    // Once in the shell header, once above the table.
    expect(
      await screen.findAllByRole('heading', { level: 1, name: 'Frames — Event 101' }),
    ).toHaveLength(2);
    expect(await screen.findByText('Event-101')).toBeVisible();
    // Legacy's Back is `history.back()`, and Event Id is off by default.
    expect(screen.getByRole('button', { name: 'Back' })).toBeVisible();

    expect(table.getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Frame Id', 'Type', 'Time Stamp', 'Time Delta', 'Score', 'Thumbnail',
    ]);

    const alarm = screen.getByTestId('frame-row-2');
    expect(alarm).toHaveAttribute('data-frame-type', 'Alarm');
    expect(within(alarm).getByText('Alarm')).toBeVisible();
    expect(within(alarm).getByText('88')).toBeVisible();
    // `delta` is a decimal string on the wire, rendered to two places.
    expect(within(alarm).getByText('1.50')).toBeVisible();

    const normal = screen.getByTestId('frame-row-1');
    expect(normal).toHaveAttribute('data-frame-type', 'Normal');
    expect(within(normal).getByText('0.00')).toBeVisible();

    // One thumbnail per row, keyed off the `Frames` row id like legacy.
    const thumbs = table.getAllByTestId(/^frame-thumb-/);
    expect(thumbs).toHaveLength(3);
    expect(thumbs[0].getAttribute('src')).toMatch(/^\/api\/v3\/frames\/\d+\/image\?token=/);
  });

  it('asks the API only for this event, one page at a time', async () => {
    const urls = recordFrameQueries(() => HttpResponse.json(paginated(db.frames)));
    renderRoute('/events/101/frames');
    await screen.findByTestId('frames-table');

    await waitFor(() => expect(urls).toHaveLength(1));
    expect(urls[0].pathname).toBe('/api/v3/frames');
    expect(urls[0].searchParams.get('event_id')).toBe('101');
    expect(urls[0].searchParams.get('page')).toBe('1');
    expect(urls[0].searchParams.get('page_size')).toBe('25');
  });

  it('shows the empty state when the event recorded no frames', async () => {
    db.frames = [];
    renderRoute('/events/101/frames');

    expect(await screen.findByText('No frames recorded for this event.')).toBeVisible();
    expect(screen.queryByTestId('frames-table')).toBeNull();
  });

  it('surfaces a backend failure instead of an empty table', async () => {
    server.use(
      http.get('/api/v3/frames', () =>
        HttpResponse.json(
          { kind: 'DATABASE_ERROR', error_message: 'frames table locked' },
          { status: 500 },
        ),
      ),
    );
    renderRoute('/events/101/frames');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Cannot reach the server.');
    expect(screen.queryByTestId('frames-table')).toBeNull();
  });

  it('hides the pager when everything fits on one page', async () => {
    renderRoute('/events/101/frames');
    await screen.findByTestId('frames-table');

    expect(screen.queryByRole('button', { name: 'Next page' })).toBeNull();
  });

  it('pages through the URL and disables the ends', async () => {
    const urls = recordFrameQueries(() =>
      HttpResponse.json(paginated(db.frames, { total: 60, per_page: 25 })),
    );
    const user = userEvent.setup();
    const { router } = renderRoute('/events/101/frames');
    await screen.findByTestId('frames-table');

    expect(screen.getByText('Page 1 / 3 · 60 frames')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ page: 2 }),
    );
    await waitFor(() =>
      expect(urls.at(-1)!.searchParams.get('page')).toBe('2'),
    );

    // Back to page 1 drops the param again rather than writing `page=1`.
    await user.click(screen.getByRole('button', { name: 'Previous page' }));
    await waitFor(() => expect(router.state.location.search).toEqual({}));
  });

  it('reflects page and page_size taken straight from the URL', async () => {
    const urls = recordFrameQueries(() =>
      HttpResponse.json(paginated(db.frames, { total: 60, per_page: 10, current_page: 2 })),
    );
    renderRoute('/events/101/frames?page=2&page_size=10');
    await screen.findByTestId('frames-table');

    await waitFor(() => expect(urls).toHaveLength(1));
    expect(urls[0].searchParams.get('page')).toBe('2');
    expect(urls[0].searchParams.get('page_size')).toBe('10');

    expect(screen.getByRole('combobox', { name: 'Rows per page' })).toHaveValue('10');
    expect(screen.getByText('Page 2 / 6 · 60 frames')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeEnabled();
  });

  it('writes a new page size to the URL and resets to page 1', async () => {
    recordFrameQueries(() =>
      HttpResponse.json(paginated(db.frames, { total: 60, per_page: 25 })),
    );
    const user = userEvent.setup();
    const { router } = renderRoute('/events/101/frames?page=3');
    await screen.findByTestId('frames-table');

    const select = screen.getByRole('combobox', { name: 'Rows per page' });
    // `0` is legacy's "All".
    expect([...(select as HTMLSelectElement).options].map((o) => o.value)).toEqual([
      '10', '25', '50', '100', '200', '0',
    ]);

    await user.selectOptions(select, '50');
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ page_size: 50 }),
    );
  });

  it('drops a malformed page param rather than throwing', async () => {
    const urls = recordFrameQueries(() => HttpResponse.json(paginated(db.frames)));
    const { router } = renderRoute('/events/101/frames?page=-4&page_size=abc');
    await screen.findByTestId('frames-table');

    expect(router.state.location.search).toEqual({});
    await waitFor(() => expect(urls).toHaveLength(1));
    expect(urls[0].searchParams.get('page')).toBe('1');
    expect(urls[0].searchParams.get('page_size')).toBe('25');
  });

  it('honours ZM_WEB_EVENTS_PER_PAGE for the default page size', async () => {
    const urls = recordFrameQueries(() => HttpResponse.json(paginated(db.frames)));
    server.use(
      configListHandler({ ZM_WEB_EVENTS_PER_PAGE: '100' }),
    );
    renderRoute('/events/101/frames');
    await screen.findByTestId('frames-table');

    await waitFor(() => expect(urls.at(-1)!.searchParams.get('page_size')).toBe('100'));
    expect(screen.getByRole('combobox', { name: 'Rows per page' })).toHaveValue('100');
  });

  it('still renders the table when the event lookup fails', async () => {
    server.use(
      http.get('/api/v3/events/:id', () =>
        HttpResponse.json({ error_message: 'gone' }, { status: 404 }),
      ),
    );
    renderRoute('/events/101/frames');

    expect(await screen.findByTestId('frames-table')).toBeVisible();
    expect(screen.queryByText('Event-101')).toBeNull();
  });
});

describe('EventFramesPage — client-side table controls', () => {
  function seed() {
    db.events = [makeEvent({ id: 101, monitor_id: 1, name: 'Event-101' })];
    db.frames = [
      makeFrame({ id: 1, event_id: 101, frame_id: 1, score: 0, delta: '0.00' }),
      makeFrame({ id: 2, event_id: 101, frame_id: 2, type: 'Alarm', score: 88, delta: '1.50' }),
      makeFrame({ id: 3, event_id: 101, frame_id: 3, score: 22, delta: '2.25' }),
    ];
  }

  it('searches and sorts the rows on screen', async () => {
    const user = userEvent.setup();
    seed();
    renderRoute('/events/101/frames');
    await screen.findByTestId('frames-table');

    const rowIds = () => screen.getAllByTestId(/^frame-row-/).map((r) => r.getAttribute('data-testid'));
    await user.click(screen.getByRole('button', { name: /^Score/ }));
    expect(rowIds()).toEqual(['frame-row-1', 'frame-row-3', 'frame-row-2']);
    await user.click(screen.getByRole('button', { name: /^Score/ }));
    expect(rowIds()).toEqual(['frame-row-2', 'frame-row-3', 'frame-row-1']);

    await user.type(screen.getByLabelText('Search frames'), 'Alarm');
    await waitFor(() => expect(rowIds()).toEqual(['frame-row-2']));
  });

  it('shows Event Id again from the column chooser', async () => {
    const user = userEvent.setup();
    seed();
    renderRoute('/events/101/frames');
    const table = within(await screen.findByTestId('frames-table'));

    await user.click(screen.getByRole('button', { name: 'Columns' }));
    await user.click(within(screen.getByTestId('frames-column-chooser')).getByRole('button', { name: 'Event Id' }));

    expect(table.getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Event Id', 'Frame Id', 'Type', 'Time Stamp', 'Time Delta', 'Score', 'Thumbnail',
    ]);
  });

  it('asks the backend for every frame when the page size is All', async () => {
    const user = userEvent.setup();
    seed();
    const urls = recordFrameQueries(() => HttpResponse.json(paginated(db.frames)));
    const { router } = renderRoute('/events/101/frames');
    await screen.findByTestId('frames-table');

    await user.selectOptions(screen.getByRole('combobox', { name: 'Rows per page' }), '0');

    await waitFor(() => expect(router.state.location.search).toEqual({ page_size: 0 }));
    await waitFor(() => expect(urls.at(-1)!.searchParams.get('page_size')).toBe('500'));
  });
});

describe('EventFramesPage — modern stats and frame links', () => {
  const stat = {
    id: 9, monitor_id: 1, zone_id: 3, event_id: 101, frame_id: 2,
    pixel_diff: 25, alarm_pixels: 15360, filter_pixels: 10000, blob_pixels: 9999, blobs: 1,
    min_blob_size: 7680, max_blob_size: 7680, min_x: 12, max_x: 300, min_y: 34, max_y: 400, score: 88,
  };

  function seed() {
    db.events = [makeEvent({ id: 101, monitor_id: 1, name: 'Event-101', width: 640, height: 480, frames: 3 })];
    db.frames = [
      makeFrame({ id: 1, event_id: 101, frame_id: 1, delta: '0.00' }),
      makeFrame({ id: 2, event_id: 101, frame_id: 2, type: 'Alarm', score: 88, delta: '1.50' }),
      makeFrame({ id: 3, event_id: 101, frame_id: 3, score: 22, delta: '2.25' }),
    ];
    db.zones = [makeZone({ id: 3, monitor_id: 1, name: 'Driveway', area: 5000, coords: '0,0 50,0 50,100 0,100' })];
    server.use(http.get('/api/v3/stats', () => HttpResponse.json(paginated([stat]))));
  }

  it('opens a row\'s stats from its chevron', async () => {
    seed();
    const user = userEvent.setup();
    renderRoute('/events/101/frames');
    await screen.findByTestId('frame-row-2');

    await user.click(screen.getByRole('button', { name: 'Show stats for frame 2' }));
    const row = await screen.findByTestId('stats-row-3');
    expect(within(row).getByText('Driveway')).toBeVisible();
    expect(within(row).getByText('15360 (10%)')).toBeVisible();
    expect(within(row).getByText('7680 (5%)')).toBeVisible();
  });

  it('goes to the stats page from Score', async () => {
    seed();
    const user = userEvent.setup();
    const { router } = renderRoute('/events/101/frames');
    await user.click(await screen.findByTestId('frame-score-2'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/events/101/stats'));
    expect(router.state.location.search).toEqual({ fid: 2 });
    expect(await screen.findByTestId('stats-row-3')).toBeVisible();
  });

  it('goes to the frame viewer from a row', async () => {
    seed();
    const user = userEvent.setup();
    const { router } = renderRoute('/events/101/frames');
    await user.click(within(await screen.findByTestId('frame-row-3')).getByText('2.25'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/events/101/frames/3'));
    expect(await screen.findByTestId('frame-image')).toHaveAttribute('src', expect.stringMatching(/^\/api\/v3\/frames\/3\/image/));
  });
});

describe('EventFramesPage — modern card view and paging', () => {
  it('shows each frame as a tile that opens the frame', async () => {
    db.events = [makeEvent({ id: 101, monitor_id: 1, name: 'Event-101' })];
    db.frames = [
      makeFrame({ id: 1, event_id: 101, frame_id: 1, delta: '0.00' }),
      makeFrame({ id: 2, event_id: 101, frame_id: 2, type: 'Alarm', score: 88, delta: '1.50' }),
    ];
    const user = userEvent.setup();
    const { router } = renderRoute('/events/101/frames');
    await screen.findByTestId('frame-row-2');

    await user.click(screen.getByRole('button', { name: 'Show card view' }));
    const card = await screen.findByTestId('frame-card-2');
    expect(card).toHaveTextContent('#2');
    expect(card).toHaveTextContent('score 88');
    await user.click(card);
    await waitFor(() => expect(router.state.location.pathname).toBe('/events/101/frames/2'));
  });

  it('jumps to a page typed into the pager', async () => {
    db.events = [makeEvent({ id: 101, monitor_id: 1, name: 'Event-101' })];
    db.frames = Array.from({ length: 30 }, (_, i) =>
      makeFrame({ id: i + 1, event_id: 101, frame_id: i + 1, delta: String(i) }));
    const user = userEvent.setup();
    const { router } = renderRoute('/events/101/frames?page_size=10');
    await screen.findByTestId('frame-row-1');

    const jump = screen.getByLabelText('Go to page');
    await user.clear(jump);
    await user.type(jump, '3{Enter}');
    await waitFor(() => expect(router.state.location.search).toMatchObject({ page: 3 }));
    expect(await screen.findByTestId('frame-row-21')).toBeVisible();
  });
});

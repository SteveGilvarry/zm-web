/**
 * Route-level tests for the Mission Control per-frame table
 * (`/events/$eventId/frames`, legacy `?view=frames&eid=`).
 *
 * Everything runs through the real router, so `validateSearch`, the page
 * size / page URL round-trip and the outgoing `/frames` query are all real.
 */
import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import { renderRoute } from '@/test/renderRoute';
import { setupMockServer, server, db } from '@/test/msw/server';
import { makeEvent, makeFrame, paginated } from '@/test/fixtures';

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
    expect(screen.getByRole('link', { name: 'Back to event' })).toHaveAttribute(
      'href',
      '/events/101',
    );

    expect(table.getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Event Id', 'Frame Id', 'Type', 'Time Stamp', 'Time Delta', 'Score', 'Thumbnail',
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

    // Thumbnails are still blocked on the API — one note per row.
    const notes = table.getAllByText('needs zm-api#26');
    expect(notes).toHaveLength(3);
    expect(notes[0].closest('td')).toHaveAttribute(
      'title',
      'Per-frame images are not served by the API yet.',
    );
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
    expect([...(select as HTMLSelectElement).options].map((o) => o.value)).toEqual([
      '10', '25', '50', '100', '200',
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
      http.get('/api/v3/configs/ZM_WEB_EVENTS_PER_PAGE', () =>
        HttpResponse.json({
          id: 9, name: 'ZM_WEB_EVENTS_PER_PAGE', value: '100',
          type: 'integer', category: 'web',
        }),
      ),
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

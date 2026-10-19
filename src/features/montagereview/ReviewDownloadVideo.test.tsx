import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import type { Monitor } from '@/types';
import { ReviewDownloadVideo } from './ReviewDownloadVideo';
import { DEFAULT_REVIEW_FILTERS } from './useReviewEvents';

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({ accessToken: 'tok', refreshToken: 'tok', isAuthenticated: true });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

const ev = (id: number, monitorId: number, start: string) => ({
  id, monitor_id: monitorId, name: `Event ${id}`, start_date_time: start, end_date_time: start, disk_space: 1024,
});

describe('ReviewDownloadVideo', () => {
  it('downloads the videos of every event in the window on the shown monitors, oldest first', async () => {
    const user = userEvent.setup();
    const asked: Array<Record<string, string>> = [];
    server.use(http.get('/api/v3/events', ({ request }) => {
      const q = Object.fromEntries(new URL(request.url).searchParams);
      asked.push(q);
      const items = q.monitor_id === '1'
        ? [ev(10, 1, '2026-10-19T10:00:00Z'), ev(12, 1, '2026-10-19T10:20:00Z')]
        : [ev(11, 2, '2026-10-19T10:10:00Z')];
      return HttpResponse.json({ items, total: items.length, per_page: 500, current_page: 1, last_page: 1 });
    }));
    let body: unknown = null;
    server.use(http.post('/api/v3/events/export', async ({ request }) => {
      body = await request.json();
      return new HttpResponse(new Blob(['PK']), {
        headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="zm-events-9.zip"' },
      });
    }));
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:zip'), configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    renderWithProviders(
      <ReviewDownloadVideo
        monitors={[{ id: 1 }, { id: 2 }] as Monitor[]}
        rangeStart={new Date('2026-10-19T10:00:00Z')}
        rangeEnd={new Date('2026-10-19T11:00:00Z')}
        filters={DEFAULT_REVIEW_FILTERS}
        variant="classic"
        trigger={(open) => <button type="button" onClick={open}>Download Video</button>}
      />,
    );
    // Nothing is fetched until the button is pressed.
    expect(asked).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Download Video' }));
    const dialog = await screen.findByRole('dialog', { name: 'Download' });
    expect(dialog).toHaveTextContent('Downloading 3 events. Resulting file should be approximately 3.00kB');
    expect(asked.map((q) => [q.monitor_id, q.start_time, q.end_time])).toEqual([
      ['1', '2026-10-19T10:00:00.000Z', '2026-10-19T11:00:00.000Z'],
      ['2', '2026-10-19T10:00:00.000Z', '2026-10-19T11:00:00.000Z'],
    ]);

    await user.click(within(dialog).getByRole('button', { name: 'Generate Download' }));
    await waitFor(() => expect(body).toEqual({ ids: [10, 11, 12], include: ['video'] }));
    click.mockRestore();
  });

  it('opens on an empty window with legacy\'s warning and nothing to generate', async () => {
    const user = userEvent.setup();
    server.use(http.get('/api/v3/events', () =>
      HttpResponse.json({ items: [], total: 0, per_page: 500, current_page: 1, last_page: 1 })));
    renderWithProviders(
      <ReviewDownloadVideo
        monitors={[{ id: 1 }] as Monitor[]}
        rangeStart={new Date('2026-10-19T10:00:00Z')}
        rangeEnd={new Date('2026-10-19T11:00:00Z')}
        filters={DEFAULT_REVIEW_FILTERS}
        variant="modern"
        trigger={(open) => <button type="button" onClick={open}>Download Video</button>}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Download Video' }));
    const dialog = await screen.findByRole('dialog', { name: 'Download' });
    expect(dialog).toHaveTextContent('There are no events found. Resulting download will be empty.');
    expect(within(dialog).getByRole('button', { name: 'Generate Download' })).toBeDisabled();
  });
});

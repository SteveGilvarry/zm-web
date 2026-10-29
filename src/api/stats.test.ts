import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw/http';
import { setupServer } from 'msw/node';
import { listStats, getAllStatsForEvent } from './stats';
import { useAuthStore } from '@/stores/auth';

const server = setupServer();

beforeAll(() => {
  useAuthStore.setState({ accessToken: 'test-token', refreshToken: 'test-refresh', user: null, isAuthenticated: true });
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const stat = (id: number, frame_id: number) => ({
  id, monitor_id: 2, zone_id: 5, event_id: 33285, frame_id,
  pixel_diff: 12, alarm_pixels: 4000, filter_pixels: 3500, blob_pixels: 3000, blobs: 2,
  min_blob_size: 100, max_blob_size: 2900, min_x: 10, max_x: 200, min_y: 20, max_y: 150, score: 37,
});

describe('stats API (zm-api#141)', () => {
  it('GETs /stats filtered by event_id and frame_id', async () => {
    let url: URL | undefined;
    server.use(
      http.get('*/api/v3/stats', ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json({ items: [stat(1, 7)], total: 1, current_page: 1, per_page: 25, last_page: 1 });
      }),
    );
    const page = await listStats({ event_id: 33285, frame_id: 7 });
    expect(url?.searchParams.get('event_id')).toBe('33285');
    expect(url?.searchParams.get('frame_id')).toBe('7');
    expect(page.items[0].score).toBe(37);
  });

  it('getAllStatsForEvent walks pages', async () => {
    server.use(
      http.get('*/api/v3/stats', ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page'));
        return HttpResponse.json(
          page === 1
            ? { items: [stat(1, 7), stat(2, 8)], total: 3, current_page: 1, per_page: 500, last_page: 2 }
            : { items: [stat(3, 9)], total: 3, current_page: 2, per_page: 500, last_page: 2 },
        );
      }),
    );
    const all = await getAllStatsForEvent(33285);
    expect(all.map((s) => s.frame_id)).toEqual([7, 8, 9]);
  });
});

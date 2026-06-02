import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { listFrames, getAllFramesForEvent, type Frame } from './frames';
import { useAuthStore } from '@/stores/auth';

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

const sampleFrame = (id: number): Frame => ({
  id, event_id: 1, frame_id: id, type: 'Normal',
  score: 0, time_stamp: '2026-06-02T00:00:00Z', delta: '0.0',
});

describe('listFrames', () => {
  it('GETs /frames with the event_id query param', async () => {
    let capturedUrl = '';
    server.use(
      http.get('/api/v3/frames', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({
          items: [sampleFrame(1)],
          total: 1, per_page: 500, current_page: 1, last_page: 1,
        });
      }),
    );
    const out = await listFrames({ event_id: 42 });
    expect(capturedUrl).toContain('event_id=42');
    expect(out.items).toHaveLength(1);
  });
});

describe('getAllFramesForEvent', () => {
  it('returns the single page when last_page=1', async () => {
    server.use(
      http.get('/api/v3/frames', () => HttpResponse.json({
        items: [sampleFrame(1), sampleFrame(2)],
        total: 2, per_page: 500, current_page: 1, last_page: 1,
      })),
    );
    const out = await getAllFramesForEvent(1);
    expect(out).toHaveLength(2);
  });

  it('walks pages until current_page >= last_page', async () => {
    let calls = 0;
    server.use(
      http.get('/api/v3/frames', ({ request }) => {
        calls += 1;
        const url = new URL(request.url);
        const page = Number(url.searchParams.get('page') ?? '1');
        if (page === 1) {
          return HttpResponse.json({
            items: [sampleFrame(1), sampleFrame(2)],
            total: 4, per_page: 500, current_page: 1, last_page: 2,
          });
        }
        return HttpResponse.json({
          items: [sampleFrame(3), sampleFrame(4)],
          total: 4, per_page: 500, current_page: 2, last_page: 2,
        });
      }),
    );
    const out = await getAllFramesForEvent(1);
    expect(calls).toBe(2);
    expect(out).toHaveLength(4);
  });

  it('stops early if the backend returns an empty page', async () => {
    let calls = 0;
    server.use(
      http.get('/api/v3/frames', () => {
        calls += 1;
        // Pretend last_page is huge but the page itself is empty — wrapper bails.
        return HttpResponse.json({
          items: [], total: 0, per_page: 500, current_page: 1, last_page: 99,
        });
      }),
    );
    const out = await getAllFramesForEvent(1);
    expect(calls).toBe(1);
    expect(out).toEqual([]);
  });
});

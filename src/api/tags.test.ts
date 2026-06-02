import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  listTags,
  createTag,
  deleteTag,
  getTagDetail,
  attachTag,
  detachTag,
} from './tags';
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

describe('listTags', () => {
  it('GETs /tags', async () => {
    server.use(
      http.get('/api/v3/tags', () => HttpResponse.json({
        items: [{ id: 1, name: 'car', event_count: 5 }],
        total: 1, per_page: 20, current_page: 1, last_page: 1,
      })),
    );
    const out = await listTags();
    expect(out.items[0].name).toBe('car');
    expect(out.items[0].event_count).toBe(5);
  });
});

describe('createTag / deleteTag', () => {
  it('createTag POSTs {name}', async () => {
    let body: unknown = null;
    server.use(
      http.post('/api/v3/tags', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: 9, name: 'person' });
      }),
    );
    const out = await createTag('person');
    expect(body).toEqual({ name: 'person' });
    expect(out.id).toBe(9);
  });

  it('deleteTag DELETEs /tags/{id}', async () => {
    let id: string | undefined;
    server.use(
      http.delete('/api/v3/tags/:id', ({ params }) => {
        id = params.id as string;
        return HttpResponse.json({}, { status: 204 });
      }),
    );
    await deleteTag(7);
    expect(id).toBe('7');
  });
});

describe('getTagDetail', () => {
  it('GETs /tags/{id} with pagination params', async () => {
    let capturedUrl = '';
    server.use(
      http.get('/api/v3/tags/:id', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({
          id: 4, name: 'car',
          events: [{ id: 1, monitor_id: 1, name: 'Event 1' }],
          total_events: 1, current_page: 1, last_page: 1, per_page: 20,
        });
      }),
    );
    const out = await getTagDetail(4, { page: 1, page_size: 20 });
    expect(capturedUrl).toContain('page=1');
    expect(out.events).toHaveLength(1);
    expect(out.total_events).toBe(1);
  });
});

describe('attachTag / detachTag', () => {
  it('attachTag POSTs /events-tags with {event_id, tag_id}', async () => {
    let body: unknown = null;
    server.use(
      http.post('/api/v3/events-tags', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ event_id: 11, tag_id: 4 });
      }),
    );
    const out = await attachTag(11, 4);
    expect(body).toEqual({ event_id: 11, tag_id: 4 });
    expect(out.tag_id).toBe(4);
  });

  it('detachTag DELETEs /events-tags/{tagId}/{eventId} (tag first)', async () => {
    let captured = '';
    server.use(
      http.delete('/api/v3/events-tags/:tagId/:eventId', ({ params, request }) => {
        captured = `${params.tagId}/${params.eventId}`;
        void request;
        return HttpResponse.json({}, { status: 204 });
      }),
    );
    await detachTag(11, 4); // event=11, tag=4 → URL is /events-tags/4/11
    expect(captured).toBe('4/11');
  });
});

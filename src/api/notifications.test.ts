import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw/http';
import type { JsonBodyType } from 'msw';
import { setupServer } from 'msw/node';
import { useAuthStore } from '@/stores/auth';
import { listNotifications, getNotification, createNotification, updateNotification, deleteNotification } from './notifications';
const server = setupServer();
let seen: Array<{ method: string; url: string; body: unknown }> = [];
/** Answer any route with `reply`, recording method, URL and JSON body. */
function record(reply: JsonBodyType = {}, status = 200) {
  seen = [];
  server.use(http.all('*', async ({ request }) => {
    let body: unknown = null;
    try { body = await request.clone().json(); } catch { /* no body */ }
    seen.push({ method: request.method, url: new URL(request.url).pathname + new URL(request.url).search, body });
    return status === 204 ? new HttpResponse(null, { status }) : HttpResponse.json(reply, { status });
  }));
}

beforeAll(() => {
  useAuthStore.setState({ accessToken: 'test', refreshToken: 'test', user: null, isAuthenticated: true });
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });


describe('push registrations (zm-api#175)', () => {
  it('lists, reads, creates, updates (PATCH) and deletes', async () => {
    record([]);
    await listNotifications();
    expect(seen[0]).toMatchObject({ method: 'GET', url: '/api/v3/notifications' });
    record({ id: 1 });
    await getNotification(1);
    expect(seen[0].url).toBe('/api/v3/notifications/1');
    record({ id: 2 });
    await createNotification({ token: 'abc', platform: 'android', monitor_list: '1,2' });
    expect(seen[0]).toMatchObject({ method: 'POST', url: '/api/v3/notifications', body: { token: 'abc', platform: 'android', monitor_list: '1,2' } });
    record({ id: 2 });
    await updateNotification(2, { push_state: 'disabled' });
    expect(seen[0]).toMatchObject({ method: 'PATCH', url: '/api/v3/notifications/2', body: { push_state: 'disabled' } });
    record(null, 204);
    await deleteNotification(2);
    expect(seen[0]).toMatchObject({ method: 'DELETE', url: '/api/v3/notifications/2' });
  });
});

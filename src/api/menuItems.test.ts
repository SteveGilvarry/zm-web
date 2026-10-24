import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw/http';
import type { JsonBodyType } from 'msw';
import { setupServer } from 'msw/node';
import { useAuthStore } from '@/stores/auth';
import { listMenuItems, getSystemMenu, getMenuItem, createMenuItem, updateMenuItem, deleteMenuItem } from './menuItems';
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


describe('menu items (zm-api#144)', () => {
  it('lists every row for Options → Menu and only the enabled ones for the header', async () => {
    record([{ id: 1, menu_key: 'Console', enabled: false, icon_type: 'material', sort_order: 10 }]);
    await listMenuItems();
    expect(seen[0]).toMatchObject({ method: 'GET', url: '/api/v3/menu-items' });
    record([]);
    await getSystemMenu();
    expect(seen[0]).toMatchObject({ method: 'GET', url: '/api/v3/system/menu' });
  });
  it('reads, creates, updates (PUT) and deletes', async () => {
    record({ id: 1 });
    await getMenuItem(1);
    expect(seen[0].url).toBe('/api/v3/menu-items/1');
    record({ id: 9 });
    await createMenuItem({ menu_key: 'Wiki', link: 'https://wiki.zoneminder.com' });
    expect(seen[0]).toMatchObject({ method: 'POST', url: '/api/v3/menu-items', body: { menu_key: 'Wiki' } });
    record({ id: 1 });
    await updateMenuItem(1, { enabled: false, label: 'Home' });
    expect(seen[0]).toMatchObject({ method: 'PUT', url: '/api/v3/menu-items/1', body: { enabled: false, label: 'Home' } });
    record(null, 204);
    await deleteMenuItem(9);
    expect(seen[0]).toMatchObject({ method: 'DELETE', url: '/api/v3/menu-items/9' });
  });
});

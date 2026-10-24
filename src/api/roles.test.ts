import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw/http';
import type { JsonBodyType } from 'msw';
import { setupServer } from 'msw/node';
import { useAuthStore } from '@/stores/auth';
import { listRoles, getRole, createRole, updateRole, deleteRole } from './roles';
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


describe('roles (zm-api#143)', () => {
  it('lists with paging', async () => {
    record({ items: [], total: 0, per_page: 25, current_page: 1, last_page: 1 });
    await listRoles({ page: 2, page_size: 10 });
    expect(seen[0]).toMatchObject({ method: 'GET', url: '/api/v3/roles?page=2&page_size=10' });
  });
  it('reads one', async () => {
    record({ id: 3, name: 'Viewer' });
    expect((await getRole(3)).name).toBe('Viewer');
    expect(seen[0].url).toBe('/api/v3/roles/3');
  });
  it('creates with the permission levels it names', async () => {
    record({ id: 4 });
    await createRole({ name: 'Ops', events: 'Edit' });
    expect(seen[0]).toMatchObject({ method: 'POST', url: '/api/v3/roles', body: { name: 'Ops', events: 'Edit' } });
  });
  it('updates with PUT and deletes', async () => {
    record({ id: 4 });
    await updateRole(4, { description: 'd' });
    expect(seen[0]).toMatchObject({ method: 'PUT', url: '/api/v3/roles/4', body: { description: 'd' } });
    record(null, 204);
    await deleteRole(4);
    expect(seen[0]).toMatchObject({ method: 'DELETE', url: '/api/v3/roles/4' });
  });
});

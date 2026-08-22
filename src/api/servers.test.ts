import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  listServers,
  createServer,
  updateServer,
  deleteServer,
} from './servers';
import { makeServer } from '@/test/fixtures/admin';
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

describe('listServers', () => {
  it('GETs /servers and returns paginated wrapper', async () => {
    server.use(
      http.get('/api/v3/servers', () => HttpResponse.json({
        items: [{ id: 1, name: 'primary', status: 'running' }],
        total: 1, per_page: 20, current_page: 1, last_page: 1,
      })),
    );
    const out = await listServers();
    expect(out.items[0].name).toBe('primary');
  });

  // zm-api#25 widened ServerResponse to the whole `Servers` row; a build older
  // than that sends only id/name/hostname/port/status and the rest stay absent.
  it('surfaces the full row, protocol and paths and daemon flags included', async () => {
    const row = makeServer({
      id: 7, protocol: 'https', port: 8443, path_to_api: '/zm/api',
      zmtrigger: 1, state_id: 2, latitude: -37.81, longitude: 144.96,
    });
    server.use(
      http.get('/api/v3/servers', () => HttpResponse.json({
        items: [row], total: 1, per_page: 20, current_page: 1, last_page: 1,
      })),
    );
    const out = await listServers();
    expect(out.items[0]).toEqual(row);
  });
});

describe('createServer', () => {
  it('POSTs the payload to /servers', async () => {
    let body: unknown = null;
    server.use(
      http.post('/api/v3/servers', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: 5, name: 'cam-host', status: 'running' });
      }),
    );
    const out = await createServer({ name: 'cam-host', hostname: '10.0.0.5', port: 80 });
    expect(body).toEqual({ name: 'cam-host', hostname: '10.0.0.5', port: 80 });
    expect(out.id).toBe(5);
  });
});

describe('updateServer', () => {
  it('PATCHes /servers/{id} with the partial body', async () => {
    let body: unknown = null;
    let method: string | undefined;
    server.use(
      http.patch('/api/v3/servers/3', async ({ request }) => {
        method = request.method;
        body = await request.json();
        return HttpResponse.json({ id: 3, name: 'renamed', status: 'running' });
      }),
    );
    await updateServer(3, { name: 'renamed' });
    expect(method).toBe('PATCH');
    expect(body).toEqual({ name: 'renamed' });
  });
});

describe('deleteServer', () => {
  it('DELETEs /servers/{id}', async () => {
    let id: string | undefined;
    server.use(
      http.delete('/api/v3/servers/:id', ({ params }) => {
        id = params.id as string;
        return HttpResponse.json({}, { status: 204 });
      }),
    );
    await deleteServer(8);
    expect(id).toBe('8');
  });
});

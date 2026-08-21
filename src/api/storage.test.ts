import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  getStorageList,
  createStorage,
  updateStorage,
  deleteStorage,
} from './storage';
import { makeStorage } from '@/test/fixtures/admin';
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

describe('getStorageList', () => {
  it('GETs /storage with pagination params', async () => {
    let capturedUrl = '';
    server.use(
      http.get('/api/v3/storage', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({
          items: [makeStorage({ name: 'default', path: '/var/lib/zm/events' })],
          total: 1, per_page: 20, current_page: 1, last_page: 1,
        });
      }),
    );
    const out = await getStorageList({ page: 2, page_size: 10 });
    expect(capturedUrl).toContain('page=2');
    expect(capturedUrl).toContain('page_size=10');
    expect(out.items[0].name).toBe('default');
  });

  it('reads back the whole StorageResponse row', async () => {
    server.use(
      http.get('/api/v3/storage', () => HttpResponse.json({
        items: [
          // The live `Default` row, verbatim.
          makeStorage({ scheme: 'Medium', server_id: 0, url: null, disk_space: 47_216_376_397, do_delete: 1 }),
          makeStorage({ id: 2, name: 'Cold', type: 's3fs', scheme: 'Deep', server_id: 3, url: 's3://bucket/zm', disk_space: null, do_delete: 0 }),
        ],
        total: 2, per_page: 25, current_page: 1, last_page: 1,
      })),
    );
    const [hot, cold] = (await getStorageList()).items;
    expect(hot).toMatchObject({ scheme: 'Medium', server_id: 0, url: null, disk_space: 47_216_376_397, do_delete: 1 });
    // disk_space is nullable: zmaudit has not costed this area yet.
    expect(cold).toMatchObject({ scheme: 'Deep', server_id: 3, url: 's3://bucket/zm', disk_space: null, do_delete: 0 });
  });
});

describe('createStorage', () => {
  it('POSTs payload to /storage', async () => {
    let body: unknown = null;
    server.use(
      http.post('/api/v3/storage', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(makeStorage({ id: 5, name: 'cold', path: '/mnt/cold' }));
      }),
    );
    const out = await createStorage({ name: 'cold', path: '/mnt/cold', type: 'local', enabled: 1 });
    expect(body).toEqual({ name: 'cold', path: '/mnt/cold', type: 'local', enabled: 1 });
    expect(out.id).toBe(5);
  });

  it('sends scheme, server_id and url, and echoes them back', async () => {
    let body: unknown = null;
    server.use(
      http.post('/api/v3/storage', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(makeStorage({
          id: 6, name: 'cold', path: '/mnt/cold', type: 's3fs',
          scheme: 'Deep', server_id: 3, url: 's3://bucket/zm', disk_space: null, do_delete: 0,
        }));
      }),
    );
    const out = await createStorage({
      name: 'cold', path: '/mnt/cold', type: 's3fs', enabled: 1,
      scheme: 'Deep', server_id: 3, url: 's3://bucket/zm',
    });
    expect(body).toEqual({
      name: 'cold', path: '/mnt/cold', type: 's3fs', enabled: 1,
      scheme: 'Deep', server_id: 3, url: 's3://bucket/zm',
    });
    expect(out).toMatchObject({ scheme: 'Deep', server_id: 3, url: 's3://bucket/zm' });
  });
});

describe('updateStorage', () => {
  it('PATCHes /storage/{id} with the partial body', async () => {
    let body: unknown = null;
    let method: string | undefined;
    server.use(
      http.patch('/api/v3/storage/3', async ({ request }) => {
        method = request.method;
        body = await request.json();
        return HttpResponse.json(makeStorage({ id: 3, name: 'archive', path: '/mnt/archive', enabled: 0 }));
      }),
    );
    await updateStorage(3, { enabled: 0 });
    expect(method).toBe('PATCH');
    expect(body).toEqual({ enabled: 0 });
  });

  it('round-trips scheme / server_id / url through the response', async () => {
    // Proven against the dev box: PATCH {"scheme":"Deep","url":"s3://…"} comes
    // back with those values on the row, and a later GET agrees.
    server.use(
      http.patch('/api/v3/storage/6', async ({ request }) => {
        const patch = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(makeStorage({ id: 6, name: 'e2e-probe-storage', ...patch }));
      }),
    );
    const out = await updateStorage(6, { scheme: 'Deep', server_id: 2, url: 's3://probe/bucket' });
    expect(out).toMatchObject({ scheme: 'Deep', server_id: 2, url: 's3://probe/bucket' });
  });
});

describe('deleteStorage', () => {
  it('DELETEs /storage/{id}', async () => {
    let id: string | undefined;
    server.use(
      http.delete('/api/v3/storage/:id', ({ params }) => {
        id = params.id as string;
        return HttpResponse.json({}, { status: 204 });
      }),
    );
    await deleteStorage(11);
    expect(id).toBe('11');
  });
});

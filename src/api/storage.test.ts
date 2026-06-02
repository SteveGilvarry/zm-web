import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  getStorageList,
  createStorage,
  updateStorage,
  deleteStorage,
} from './storage';
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
          items: [{ id: 1, name: 'default', path: '/var/lib/zm/events', type: 'local', enabled: 1 }],
          total: 1, per_page: 20, current_page: 1, last_page: 1,
        });
      }),
    );
    const out = await getStorageList({ page: 2, page_size: 10 });
    expect(capturedUrl).toContain('page=2');
    expect(capturedUrl).toContain('page_size=10');
    expect(out.items[0].name).toBe('default');
  });
});

describe('createStorage', () => {
  it('POSTs payload to /storage', async () => {
    let body: unknown = null;
    server.use(
      http.post('/api/v3/storage', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: 5, name: 'cold', path: '/mnt/cold', type: 'local', enabled: 1 });
      }),
    );
    const out = await createStorage({ name: 'cold', path: '/mnt/cold', type: 'local', enabled: 1 });
    expect(body).toEqual({ name: 'cold', path: '/mnt/cold', type: 'local', enabled: 1 });
    expect(out.id).toBe(5);
  });
});

describe('updateStorage', () => {
  it('PUTs /storage/{id} with the partial body', async () => {
    let body: unknown = null;
    let method: string | undefined;
    server.use(
      http.put('/api/v3/storage/3', async ({ request }) => {
        method = request.method;
        body = await request.json();
        return HttpResponse.json({ id: 3, name: 'archive', path: '/mnt/archive', type: 'local', enabled: 0 });
      }),
    );
    await updateStorage(3, { enabled: 0 });
    expect(method).toBe('PUT');
    expect(body).toEqual({ enabled: 0 });
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

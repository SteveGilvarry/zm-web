import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { getUsers, createUser, updateUser, deleteUser } from './users';
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

describe('getUsers', () => {
  it('GETs /users with pagination params', async () => {
    let capturedUrl = '';
    server.use(
      http.get('/api/v3/users', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({
          items: [{ id: 1, username: 'admin', enabled: 1 }],
          total: 1, per_page: 20, current_page: 1, last_page: 1,
        });
      }),
    );
    const out = await getUsers({ page: 1, page_size: 20 });
    expect(capturedUrl).toContain('page=1');
    expect(out.items[0].username).toBe('admin');
  });
});

describe('createUser', () => {
  it('POSTs full user payload to /users', async () => {
    let body: unknown = null;
    server.use(
      http.post('/api/v3/users', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: 9, username: 'ops', enabled: 1 });
      }),
    );
    const payload = {
      username: 'ops', password: 'pw', name: 'Ops', email: 'o@x',
      enabled: 1, system: 'View',
    };
    const out = await createUser(payload);
    expect(body).toEqual(payload);
    expect(out.id).toBe(9);
  });
});

describe('updateUser', () => {
  it('PUTs /users/{id} with the partial body', async () => {
    let body: unknown = null;
    let method: string | undefined;
    server.use(
      http.put('/api/v3/users/3', async ({ request }) => {
        method = request.method;
        body = await request.json();
        return HttpResponse.json({ id: 3, username: 'admin', enabled: 0 });
      }),
    );
    await updateUser(3, { enabled: 0 });
    expect(method).toBe('PUT');
    expect(body).toEqual({ enabled: 0 });
  });
});

describe('deleteUser', () => {
  it('DELETEs /users/{id}', async () => {
    let id: string | undefined;
    server.use(
      http.delete('/api/v3/users/:id', ({ params }) => {
        id = params.id as string;
        return HttpResponse.json({}, { status: 204 });
      }),
    );
    await deleteUser(8);
    expect(id).toBe('8');
  });
});

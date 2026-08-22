import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { login, logout, refreshToken } from './auth';
import { useAuthStore } from '@/stores/auth';

/**
 * auth.ts uses raw fetch (not authedFetch) — it's the bootstrap path that
 * acquires the token used by everything else. We still seed the store so
 * any test that incidentally triggers store reads doesn't blow up.
 */
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

describe('login', () => {
  it('POSTs credentials as JSON and returns the parsed response', async () => {
    let body: unknown = null;
    server.use(
      http.post('/api/v3/auth/login', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          access_token: 'a',
          refresh_token: 'r',
          expire_in: 600,
          token_type: 'Bearer',
        });
      }),
    );
    const out = await login({ username: 'admin', password: 'pw' });
    expect(body).toEqual({ username: 'admin', password: 'pw' });
    expect(out.access_token).toBe('a');
    expect(out.refresh_token).toBe('r');
  });

  it('throws with the backend-supplied message on non-2xx', async () => {
    server.use(
      http.post('/api/v3/auth/login', () =>
        HttpResponse.json({ message: 'Invalid credentials' }, { status: 401 }),
      ),
    );
    await expect(login({ username: 'admin', password: 'bad' })).rejects.toThrow(
      'Invalid credentials',
    );
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    server.use(
      http.post('/api/v3/auth/login', () =>
        new HttpResponse('not-json', { status: 500 }),
      ),
    );
    await expect(login({ username: 'admin', password: 'pw' })).rejects.toThrow(
      'Login failed',
    );
  });
});

describe('logout', () => {
  it('GETs /auth/logout with a Bearer header (the route is GET, POST is 405)', async () => {
    let authHeader: string | null = null;
    server.use(
      http.get('/api/v3/auth/logout', ({ request }) => {
        authHeader = request.headers.get('authorization');
        return HttpResponse.json({});
      }),
    );
    await logout('abc.def.ghi');
    expect(authHeader).toBe('Bearer abc.def.ghi');
  });
});

describe('refreshToken', () => {
  it('POSTs {token: ...} (NOT refresh_token) — backend schema requirement', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post('/api/v3/auth/refresh', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          access_token: 'new-a',
          refresh_token: 'new-r',
          expire_in: 600,
          token_type: 'Bearer',
        });
      }),
    );
    const out = await refreshToken('stale-refresh');
    expect(body).toEqual({ token: 'stale-refresh' });
    expect(out.access_token).toBe('new-a');
  });

  it('throws a generic error when refresh fails', async () => {
    server.use(
      http.post('/api/v3/auth/refresh', () =>
        HttpResponse.json({}, { status: 401 }),
      ),
    );
    await expect(refreshToken('bad')).rejects.toThrow('Token refresh failed');
  });
});

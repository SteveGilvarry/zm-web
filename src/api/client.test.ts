import { describe, expect, it, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { apiGet, apiPost, apiDelete, ApiClientError } from './client';
import { useAuthStore } from '@/stores/auth';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Seed a JWT-shaped token so the store thinks we're logged in for each test.
function jwt(payload: Record<string, unknown>): string {
  const base64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${base64({ alg: 'none' })}.${base64(payload)}.sig`;
}
const futureExp = () => Math.floor(Date.now() / 1000) + 600;

beforeEach(() => {
  useAuthStore.getState().clearAuth();
  useAuthStore.getState().setTokens(
    jwt({ iat: futureExp() - 600, exp: futureExp(), user: 'admin', uid: 1 }),
    'refresh.token',
  );
});

describe('authedFetch — auth header injection', () => {
  it('adds Authorization: Bearer <token> on every request', async () => {
    let received: string | null = null;
    server.use(
      http.get('/api/v3/anything', ({ request }) => {
        received = request.headers.get('authorization');
        return HttpResponse.json({});
      }),
    );
    await apiGet('/anything');
    expect(received).toMatch(/^Bearer /);
  });
});

describe('authedFetch — 401 retry path', () => {
  it('refreshes on 401 then retries the original request', async () => {
    let firstCall = true;
    let refreshHits = 0;

    server.use(
      http.get('/api/v3/protected', () => {
        if (firstCall) {
          firstCall = false;
          return HttpResponse.json({ error: 'expired' }, { status: 401 });
        }
        return HttpResponse.json({ ok: true });
      }),
      http.post('/api/v3/auth/refresh', () => {
        refreshHits += 1;
        return HttpResponse.json({
          access_token: jwt({ iat: futureExp() - 600, exp: futureExp(), user: 'admin', uid: 1 }),
          refresh_token: 'refresh.new',
          expire_in: 600,
          token_type: 'Bearer',
        });
      }),
    );

    const result = await apiGet<{ ok: boolean }>('/protected');
    expect(result).toEqual({ ok: true });
    expect(refreshHits).toBe(1);
  });

  it('propagates the 401 when the refresh itself fails', async () => {
    server.use(
      http.get('/api/v3/protected', () =>
        HttpResponse.json({ error: 'expired' }, { status: 401 }),
      ),
      http.post('/api/v3/auth/refresh', () =>
        HttpResponse.json({}, { status: 401 }),
      ),
    );
    await expect(apiGet('/protected')).rejects.toBeInstanceOf(ApiClientError);
    // Store should have been cleared by the failed refresh.
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('does NOT retry on 4xx errors other than 401', async () => {
    let hits = 0;
    server.use(
      http.get('/api/v3/whatever', () => {
        hits += 1;
        return HttpResponse.json({ error: 'forbidden' }, { status: 403 });
      }),
    );
    await expect(apiGet('/whatever')).rejects.toBeInstanceOf(ApiClientError);
    expect(hits).toBe(1); // no retry
  });
});

describe('authedFetch — concurrent 401 dedupes the refresh', () => {
  it('5 concurrent 401s trigger exactly ONE refresh request', async () => {
    let refreshHits = 0;
    let serverHits = 0;
    // Refresh slowly so concurrent callers all hit the inflight dedupe.
    let resolveRefresh: () => void = () => {};
    const refreshGate = new Promise<void>((r) => { resolveRefresh = r; });

    server.use(
      http.get('/api/v3/burst', () => {
        serverHits += 1;
        // First call from each caller 401s; the post-refresh retry succeeds.
        if (serverHits <= 5) {
          return HttpResponse.json({ error: 'expired' }, { status: 401 });
        }
        return HttpResponse.json({ ok: true });
      }),
      http.post('/api/v3/auth/refresh', async () => {
        refreshHits += 1;
        await refreshGate; // hold the refresh until all 5 are queued
        return HttpResponse.json({
          access_token: jwt({ iat: futureExp() - 600, exp: futureExp(), user: 'admin', uid: 1 }),
          refresh_token: 'refresh.new',
          expire_in: 600,
          token_type: 'Bearer',
        });
      }),
    );

    const pending = [
      apiGet('/burst'),
      apiGet('/burst'),
      apiGet('/burst'),
      apiGet('/burst'),
      apiGet('/burst'),
    ];

    // Give the runtime a microtask to queue everything before releasing the refresh.
    await new Promise((r) => setTimeout(r, 50));
    resolveRefresh();
    await Promise.all(pending);

    expect(refreshHits).toBe(1);    // <-- the dedupe guarantee
    expect(serverHits).toBe(10);    // 5 original + 5 retries
  });
});

describe('apiPost / apiDelete — payload + status handling', () => {
  it('apiPost serialises body as JSON', async () => {
    let body: unknown = null;
    server.use(
      http.post('/api/v3/things', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: 1 });
      }),
    );
    await apiPost('/things', { name: 'x' });
    expect(body).toEqual({ name: 'x' });
  });

  it('apiDelete resolves on 204 (no content) without throwing', async () => {
    server.use(
      http.delete('/api/v3/things/:id', () => HttpResponse.json({}, { status: 204 })),
    );
    await expect(apiDelete('/things/1')).resolves.toBeUndefined();
  });
});

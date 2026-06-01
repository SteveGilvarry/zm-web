import { describe, expect, it, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { useAuthStore } from './auth';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  // Reset to a known clean state.
  useAuthStore.getState().clearAuth();
});

// A JWT-shaped token whose payload claims iat/exp; the store decodes
// the payload to derive isAuthenticated and refresh scheduling.
function jwt(payload: Record<string, unknown>): string {
  const base64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${base64({ alg: 'none' })}.${base64(payload)}.sig`;
}

// Anchor against the current clock so exp claims are genuinely in the
// future; if we used a hard-coded epoch the tokens would look expired
// the moment the calendar rolls past it.
const futureNow = () => Math.floor(Date.now() / 1000);
const NOW = futureNow();

describe('auth store — setTokens', () => {
  it('decodes the access JWT and marks the user authenticated', () => {
    const token = jwt({ iat: NOW, exp: NOW + 600, user: 'admin', uid: 1 });
    useAuthStore.getState().setTokens(token, 'refresh.token');
    const s = useAuthStore.getState();
    expect(s.accessToken).toBe(token);
    expect(s.user?.user).toBe('admin');
    expect(s.isAuthenticated).toBe(true);
  });

  it('marks the user unauthenticated when the token is already expired', () => {
    const past = Math.floor(Date.now() / 1000) - 7200;
    const token = jwt({ iat: past, exp: past + 600, user: 'admin', uid: 1 });
    useAuthStore.getState().setTokens(token, 'refresh.token');
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});

describe('auth store — refresh()', () => {
  it('swaps tokens on a successful refresh', async () => {
    const token1 = jwt({ iat: NOW, exp: NOW + 600, user: 'admin', uid: 1 });
    const token2 = jwt({ iat: NOW + 1, exp: NOW + 601, user: 'admin', uid: 1 });
    useAuthStore.getState().setTokens(token1, 'refresh.v1');

    server.use(
      http.post('/api/v3/auth/refresh', () => HttpResponse.json({
        access_token: token2,
        refresh_token: 'refresh.v2',
        expire_in: 600,
        token_type: 'Bearer',
      })),
    );

    const result = await useAuthStore.getState().refresh();
    expect(result).toBe(token2);
    expect(useAuthStore.getState().accessToken).toBe(token2);
    expect(useAuthStore.getState().refreshToken).toBe('refresh.v2');
  });

  it('clears auth and returns null when the refresh endpoint fails', async () => {
    const token = jwt({ iat: NOW, exp: NOW + 600, user: 'admin', uid: 1 });
    useAuthStore.getState().setTokens(token, 'refresh.expired');

    server.use(
      http.post('/api/v3/auth/refresh', () => HttpResponse.json(
        { error: 'invalid refresh token' },
        { status: 401 },
      )),
    );

    const result = await useAuthStore.getState().refresh();
    expect(result).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('dedupes concurrent calls into a single network request', async () => {
    const token1 = jwt({ iat: NOW, exp: NOW + 600, user: 'admin', uid: 1 });
    const token2 = jwt({ iat: NOW + 1, exp: NOW + 601, user: 'admin', uid: 1 });
    useAuthStore.getState().setTokens(token1, 'refresh.v1');

    let hits = 0;
    server.use(
      http.post('/api/v3/auth/refresh', () => {
        hits += 1;
        return HttpResponse.json({
          access_token: token2,
          refresh_token: 'refresh.v2',
          expire_in: 600,
          token_type: 'Bearer',
        });
      }),
    );

    // Fire 5 refreshes in parallel — should resolve to the same promise
    // and only hit the network once.
    const results = await Promise.all([
      useAuthStore.getState().refresh(),
      useAuthStore.getState().refresh(),
      useAuthStore.getState().refresh(),
      useAuthStore.getState().refresh(),
      useAuthStore.getState().refresh(),
    ]);
    expect(hits).toBe(1);
    expect(results.every((r) => r === token2)).toBe(true);
  });

  it('returns null without calling the network when no refresh token', async () => {
    let hits = 0;
    server.use(
      http.post('/api/v3/auth/refresh', () => {
        hits += 1;
        return HttpResponse.json({}, { status: 200 });
      }),
    );
    const out = await useAuthStore.getState().refresh();
    expect(out).toBeNull();
    expect(hits).toBe(0);
  });
});

describe('auth store — clearAuth', () => {
  it('drops every credential field', () => {
    const token = jwt({ iat: NOW, exp: NOW + 600, user: 'admin', uid: 1 });
    useAuthStore.getState().setTokens(token, 'refresh.token');

    useAuthStore.getState().clearAuth();
    const s = useAuthStore.getState();
    expect(s.accessToken).toBeNull();
    expect(s.refreshToken).toBeNull();
    expect(s.user).toBeNull();
    expect(s.isAuthenticated).toBe(false);
  });
});

// The store schedules a background refresh ~60s before the access token's
// exp claim. Verify the timer is set up (we can't easily wait 9 minutes in
// a unit test, so we check the timer count via fake timers).
describe('auth store — background refresh timer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('schedules a refresh on login', async () => {
    const future = Math.floor(Date.now() / 1000) + 600;
    const token = jwt({ iat: future - 600, exp: future, user: 'admin', uid: 1 });
    useAuthStore.getState().setTokens(token, 'refresh.token');

    // Capture pending timers — the store should have one queued.
    const pending = vi.getTimerCount();
    expect(pending).toBeGreaterThan(0);
  });
});

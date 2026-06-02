import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { listSessions, createSession, deleteSession } from './sessions';
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

describe('listSessions', () => {
  it('GETs /sessions', async () => {
    server.use(
      http.get('/api/v3/sessions', () => HttpResponse.json({
        items: [{ id: 'abc', access: 1 }],
        total: 1, per_page: 20, current_page: 1, last_page: 1,
      })),
    );
    const out = await listSessions();
    expect(out.items[0].id).toBe('abc');
  });
});

describe('createSession', () => {
  it('POSTs the payload to /sessions', async () => {
    let body: unknown = null;
    server.use(
      http.post('/api/v3/sessions', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: 'tok', access: 1, data: 'meta' });
      }),
    );
    const out = await createSession({ id: 'tok', access: 1, data: 'meta' });
    expect(body).toEqual({ id: 'tok', access: 1, data: 'meta' });
    expect(out.id).toBe('tok');
  });
});

describe('deleteSession', () => {
  it('DELETEs /sessions/{id} (id URL-encoded)', async () => {
    let captured = '';
    server.use(
      http.delete('/api/v3/sessions/:id', ({ params, request }) => {
        captured = request.url;
        // MSW path params auto-decode; we assert against the raw URL instead.
        void params;
        return HttpResponse.json({}, { status: 204 });
      }),
    );
    await deleteSession('a/b+c');
    // '/' → %2F, '+' → %2B
    expect(captured).toContain('a%2Fb%2Bc');
  });
});

import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server, setupMockServer } from '@/test/msw/server';
import { useAuthStore } from '@/stores/auth';
import { getMe } from './me';

setupMockServer();

/**
 * `/me` has shipped in two shapes. zm_api used to return the user object
 * itself; current builds wrap it as `{ user, issued_at, expires_at,
 * token_type }`. Reading the wrapper as a user is not a small error — the
 * permission columns vanish, `permsFromUser` reads that as None on every
 * feature, and the UI hides the live wall and every edit control. Both shapes
 * are exercised here because operators run both backends.
 */
describe('getMe', () => {
  it('unwraps the current MeResponse', async () => {
    useAuthStore.setState({ accessToken: 't', refreshToken: 'r', isAuthenticated: true, user: null });
    server.use(
      http.get('/api/v3/me', () =>
        HttpResponse.json({
          user: { id: 7, username: 'op', stream: 'View', events: 'Edit' },
          issued_at: '2026-08-22T00:00:00Z',
          expires_at: '2026-08-22T00:10:00Z',
          token_type: 'Bearer',
        })),
    );

    const me = await getMe();
    expect(me.id).toBe(7);
    expect(me.username).toBe('op');
    // The columns the permission layer reads.
    expect(me.stream).toBe('View');
    expect(me.events).toBe('Edit');
  });

  it('accepts the flat UserResponse older backends return', async () => {
    useAuthStore.setState({ accessToken: 't', refreshToken: 'r', isAuthenticated: true, user: null });
    server.use(
      http.get('/api/v3/me', () =>
        HttpResponse.json({ id: 9, username: 'legacy', stream: 'Edit' })),
    );

    const me = await getMe();
    expect(me.id).toBe(9);
    expect(me.username).toBe('legacy');
    expect(me.stream).toBe('Edit');
  });
});

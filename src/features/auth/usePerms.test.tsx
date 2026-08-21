/**
 * Permissions come from two places: the token's `perms` claim (immediate,
 * taken at login) and `GET /me` (live). The claim must answer on first
 * render so nothing flashes, and `/me` must win once it lands.
 */
import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import { makeUser } from '@/test/fixtures';
import type { UserClaims } from '@/types';
import { usePerms } from './usePerms';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

function signIn(claims: Partial<UserClaims>) {
  useAuthStore.setState({
    accessToken: 't',
    refreshToken: 't',
    isAuthenticated: true,
    user: { iat: 0, exp: Date.now() / 1000 + 3600, user: 'ops', ...claims } as UserClaims,
  });
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
    {children}
  </QueryClientProvider>
);

describe('usePerms', () => {
  it('answers from the token claim before /me resolves, then reconciles', async () => {
    signIn({ perms: { system: 'None', events: 'View' } });
    server.use(http.get('/api/v3/me', () =>
      HttpResponse.json(makeUser({ system: 'Edit', events: 'View' }))));

    const { result } = renderHook(() => usePerms(), { wrapper });

    // First render: the claim, no waiting.
    expect(result.current.can('system', 'Edit')).toBe(false);
    expect(result.current.level('events')).toBe('View');

    // A permission an admin granted after this token was issued now lands
    // without a re-login.
    await waitFor(() => expect(result.current.can('system', 'Edit')).toBe(true));
  });

  it('keeps the claim when /me is missing (zm_api without the route)', async () => {
    signIn({ perms: { system: 'Edit' } });
    server.use(http.get('/api/v3/me', () =>
      HttpResponse.json({ kind: 'NOT_FOUND_ERROR' }, { status: 404 })));

    const { result } = renderHook(() => usePerms(), { wrapper });
    await waitFor(() => expect(result.current.can('system', 'Edit')).toBe(true));
    expect(result.current.known).toBe(true);
    expect(result.current.can('events', 'View')).toBe(false);
  });

  it('grants everything on a pre-RBAC token until /me says otherwise', async () => {
    signIn({});
    server.use(http.get('/api/v3/me', () => HttpResponse.json(makeUser({ system: 'None' }))));

    const { result } = renderHook(() => usePerms(), { wrapper });
    expect(result.current.known).toBe(false);
    expect(result.current.can('system', 'Edit')).toBe(true);

    await waitFor(() => expect(result.current.can('system', 'Edit')).toBe(false));
    expect(result.current.known).toBe(true);
  });

  it('asks for nothing while signed out', async () => {
    useAuthStore.getState().clearAuth();
    server.use(http.get('/api/v3/me', () => HttpResponse.error()));

    const { result } = renderHook(() => usePerms(), { wrapper });
    expect(result.current.can('events', 'View')).toBe(false);
    expect(result.current.known).toBe(true);
  });
});

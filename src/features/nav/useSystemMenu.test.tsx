import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw/http';
import { setupServer } from 'msw/node';
import { useAuthStore } from '@/stores/auth';
import { defaultMenu, makeMenuItem } from '@/test/fixtures/optionsAdmin';
import { useSystemMenu } from './useSystemMenu';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const signIn = () => useAuthStore.setState({ accessToken: 't', refreshToken: 't', isAuthenticated: true, user: { user: 'admin' } as never });

describe('useSystemMenu', () => {
  it('maps the dev box menu to routes, captions and default icons', async () => {
    signIn();
    server.use(http.get('/api/v3/system/menu', () => HttpResponse.json(defaultMenu())));
    const { result } = renderHook(() => useSystemMenu(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.entries).not.toBeNull());
    const entries = result.current.entries!;
    expect(entries.map((e) => e.key)).toEqual([
      'Console', 'Watch', 'Montage', 'MontageReview', 'Events', 'Options', 'Log', 'Devices',
      'IntelGpu', 'Groups', 'Filters', 'Snapshots', 'Reports', 'ReportEventAudit', 'Map',
    ]);
    const byKey = Object.fromEntries(entries.map((e) => [e.key, e]));
    expect(byKey.Console).toMatchObject({ label: 'Console', link: '/', builtin: true, external: false, icon: 'dashboard', iconType: 'material' });
    expect(byKey.MontageReview).toMatchObject({ label: 'Montage Review', link: '/montagereview', icon: 'movie' });
    expect(byKey.ReportEventAudit).toMatchObject({ label: 'Audit Events Report', link: '/audit' });
    expect(byKey.Log.link).toBe('/logs');
    expect(byKey.Watch).toMatchObject({ link: '/cycle', icon: 'menu' });
    // No page here for these.
    expect(byKey.Devices.link).toBeNull();
    expect(byKey.Map.link).toBeNull();
  });

  it('applies overrides, drops disabled rows and sorts by sort_order', async () => {
    signIn();
    server.use(http.get('/api/v3/system/menu', () => HttpResponse.json([
      makeMenuItem({ id: 3, menu_key: 'Events', sort_order: 30, label: 'Recordings', icon: 'fa-film', icon_type: 'fontawesome' }),
      makeMenuItem({ id: 1, menu_key: 'Console', sort_order: 40 }),
      makeMenuItem({ id: 2, menu_key: 'Montage', sort_order: 5, enabled: false }),
      makeMenuItem({ id: 9, menu_key: 'Wiki', sort_order: 20, link: 'https://wiki.example.com' }),
      makeMenuItem({ id: 10, menu_key: 'Status', sort_order: 25, icon_type: 'none' }),
    ])));
    const { result } = renderHook(() => useSystemMenu(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.entries).not.toBeNull());
    const entries = result.current.entries!;
    expect(entries.map((e) => e.key)).toEqual(['Wiki', 'Status', 'Events', 'Console']);
    expect(entries[0]).toMatchObject({ builtin: false, label: 'Wiki', link: 'https://wiki.example.com', external: true, icon: 'menu' });
    // A custom key without a link uses legacy's ?view= rule.
    expect(entries[1]).toMatchObject({ link: '?view=Status', iconType: 'none', icon: '' });
    expect(entries[2]).toMatchObject({ label: 'Recordings', link: '/events', icon: 'fa-film', iconType: 'fontawesome' });
  });

  it('stays null when the request fails, so a shell keeps its own order', async () => {
    signIn();
    server.use(http.get('/api/v3/system/menu', () => HttpResponse.json({ error: 'x' }, { status: 500 })));
    const { result } = renderHook(() => useSystemMenu(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.entries).toBeNull();
  });

  it('does not ask while signed out', () => {
    useAuthStore.getState().clearAuth();
    const { result } = renderHook(() => useSystemMenu(), { wrapper: wrapper() });
    expect(result.current.entries).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });
});

import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/components/common/toastStore';
import type { User } from '@/types';
import { useGlobalPermissions } from './useGlobalPermissions';

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({ accessToken: 't', refreshToken: 't', user: null, isAuthenticated: true });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  server.resetHandlers();
  useToastStore.getState().clear();
});
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

const ops: User = {
  id: 7, username: 'ops', name: 'Ops', email: 'ops@example.com', enabled: 1,
  system: 'None', stream: 'View', events: 'View', control: 'None', monitors: 'View',
  groups: 'None', devices: 'None', snapshots: 'None',
};

const level = (rows: ReturnType<typeof useGlobalPermissions>['rows'], key: string) =>
  rows.find((r) => r.key === key)?.value;

describe('useGlobalPermissions', () => {
  it('PUTs one field per change and adopts the confirmed row', async () => {
    const bodies: unknown[] = [];
    server.use(http.put('/api/v3/users/7', async ({ request }) => {
      const body = (await request.json()) as Record<string, string>;
      bodies.push(body);
      return HttpResponse.json({ ...ops, ...body });
    }));
    const { result } = renderHook(() => useGlobalPermissions(ops), { wrapper });
    expect(level(result.current.rows, 'monitors')).toBe('View');

    act(() => result.current.setLevel('monitors', 'Create'));
    expect(level(result.current.rows, 'monitors')).toBe('Create');
    await waitFor(() => expect(result.current.isSaving).toBe(false));
    expect(bodies).toEqual([{ monitors: 'Create' }]);
    expect(level(result.current.rows, 'monitors')).toBe('Create');
    expect(useToastStore.getState().toasts[0]?.tone).toBe('success');
  });

  it('ignores a no-op click and unknown rows', async () => {
    let hits = 0;
    server.use(http.put('/api/v3/users/7', () => { hits += 1; return HttpResponse.json(ops); }));
    const { result } = renderHook(() => useGlobalPermissions(ops), { wrapper });
    act(() => result.current.setLevel('monitors', 'View'));
    act(() => result.current.setLevel('nope', 'Edit'));
    await new Promise((r) => setTimeout(r, 10));
    expect(hits).toBe(0);
  });

  it('reverts the level and toasts when the backend refuses', async () => {
    server.use(http.put('/api/v3/users/7', () =>
      HttpResponse.json({ kind: 'VALIDATION', error_message: 'bad level' }, { status: 422 })));
    const { result } = renderHook(() => useGlobalPermissions(ops), { wrapper });
    act(() => result.current.setLevel('system', 'Edit'));
    expect(level(result.current.rows, 'system')).toBe('Edit');
    await waitFor(() => expect(level(result.current.rows, 'system')).toBe('None'));
    expect(useToastStore.getState().toasts[0]?.tone).toBe('error');
  });
});

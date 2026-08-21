/**
 * `useAccountForm` — the failure paths: a rejected create/update surfaces
 * the backend message both inline (`error`) and as a toast, and a password
 * that doesn't match its confirmation never reaches the network.
 */
import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/components/common/toastStore';
import type { User } from '@/types';
import { useAccountForm } from './useAccountForm';

let requests = 0;

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({ accessToken: 't', refreshToken: 't', user: null, isAuthenticated: true });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  server.resetHandlers();
  requests = 0;
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

const existing: User = {
  id: 7, username: 'ops', name: 'Ops', email: 'ops@example.com', enabled: 1, phone: '555',
  system: 'None', stream: 'View', events: 'View', control: 'None', monitors: 'View',
  groups: 'None', devices: 'None', snapshots: 'None',
};

const noop = () => {};

describe('useAccountForm — rejected writes', () => {
  it('shows the backend message inline and as an error toast when the update fails', async () => {
    server.use(
      http.put('/api/v3/users/7', () =>
        HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'Users table locked' }, { status: 500 })),
    );
    const { result } = renderHook(() => useAccountForm(existing, noop), { wrapper });

    act(() => result.current.submit());

    await waitFor(() => expect(result.current.error).toMatch(/Users table locked/));
    expect(result.current.isSaving).toBe(false);
    await waitFor(() => expect(useToastStore.getState().toasts).toHaveLength(1));
    expect(useToastStore.getState().toasts[0].tone).toBe('error');
  });

  it('does the same when the create is refused', async () => {
    server.use(
      http.post('/api/v3/users', () =>
        HttpResponse.json({ kind: 'CONFLICT', error_message: 'username already exists' }, { status: 409 })),
    );
    const { result } = renderHook(() => useAccountForm(null, noop), { wrapper });

    act(() => {
      result.current.setField('username', 'newbie');
      result.current.setField('password', 'hunter2');
      result.current.setField('confirmPassword', 'hunter2');
    });
    act(() => result.current.submit());

    await waitFor(() => expect(result.current.error).toMatch(/username already exists/));
    expect(useToastStore.getState().toasts[0].tone).toBe('error');
  });

  it('reports a network failure rather than silently doing nothing', async () => {
    server.use(http.put('/api/v3/users/7', () => HttpResponse.error()));
    const { result } = renderHook(() => useAccountForm(existing, noop), { wrapper });

    act(() => result.current.submit());

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(useToastStore.getState().toasts[0].tone).toBe('error');
  });
});

describe('useAccountForm — client-side validation', () => {
  it('blocks the request when the password and its confirmation differ', async () => {
    server.use(http.post('/api/v3/users', () => { requests += 1; return HttpResponse.json({ id: 9 }); }));
    const { result } = renderHook(() => useAccountForm(null, noop), { wrapper });

    act(() => {
      result.current.setField('username', 'newbie');
      result.current.setField('password', 'hunter2');
      result.current.setField('confirmPassword', 'hunter3');
    });
    act(() => result.current.submit());

    expect(result.current.error).toBe('Passwords do not match.');
    await waitFor(() => expect(result.current.isSaving).toBe(false));
    expect(requests).toBe(0);

    // Fixing the confirmation clears the error and lets the create through.
    act(() => result.current.setField('confirmPassword', 'hunter2'));
    act(() => result.current.submit());
    await waitFor(() => expect(requests).toBe(1));
    expect(result.current.error).toBeNull();
  });
});

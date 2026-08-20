import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import type { User } from '@/types';
import { LOCKED_ON_EDIT, useAccountForm } from './useAccountForm';

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({ accessToken: 't', refreshToken: 't', user: null, isAuthenticated: true });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
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

describe('useAccountForm — edit (F-18 / zm-api#23)', () => {
  it('PUTs only email + enabled, never the fields the backend drops', async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.put('/api/v3/users/7', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...existing, ...body });
      }),
    );
    let saved = 0;
    const { result } = renderHook(() => useAccountForm(existing, () => { saved += 1; }), { wrapper });

    act(() => {
      result.current.setField('email', 'new@example.com');
      result.current.setField('name', 'Renamed');
      result.current.setField('password', 'hunter22');
      result.current.setField('confirmPassword', 'hunter22');
      result.current.toggleEnabled();
    });
    act(() => result.current.submit());

    await waitFor(() => expect(saved).toBe(1));
    expect(body).toEqual({ email: 'new@example.com', enabled: 0 });
  });

  it('reports password/name/phone as locked on edit and free on create', () => {
    const edit = renderHook(() => useAccountForm(existing, () => {}), { wrapper });
    for (const f of LOCKED_ON_EDIT) expect(edit.result.current.isLocked(f)).toBe(true);
    const create = renderHook(() => useAccountForm(null, () => {}), { wrapper });
    for (const f of LOCKED_ON_EDIT) expect(create.result.current.isLocked(f)).toBe(false);
  });

  it('create still sends the full account', async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post('/api/v3/users', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...existing, id: 8 });
      }),
    );
    const { result } = renderHook(() => useAccountForm(null, () => {}), { wrapper });
    act(() => {
      result.current.setField('username', 'new');
      result.current.setField('password', 'pw');
      result.current.setField('confirmPassword', 'pw');
      result.current.setField('email', 'n@example.com');
    });
    act(() => result.current.submit());
    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toMatchObject({ username: 'new', password: 'pw', email: 'n@example.com', enabled: 1 });
  });
});

describe('username pattern and self-edit', () => {
  it('rejects usernames outside [A-Za-z0-9 .@]+ before any request', async () => {
    const { isValidUsername } = await import('./useAccountForm');
    expect(isValidUsername('ops.user@site 2')).toBe(true);
    expect(isValidUsername('bad/name')).toBe(false);
    expect(isValidUsername('')).toBe(false);

    let hits = 0;
    server.use(http.post('/api/v3/users', () => { hits += 1; return HttpResponse.json({}, { status: 201 }); }));
    const { result } = renderHook(() => useAccountForm(null, () => {}), { wrapper });
    act(() => {
      result.current.setField('username', 'no#way');
      result.current.setField('password', 'pw');
      result.current.setField('confirmPassword', 'pw');
    });
    expect(result.current.usernameError).toMatch(/letters, digits/);
    expect(result.current.submitDisabled).toBe(true);
    act(() => result.current.submit());
    expect(hits).toBe(0);
  });

  it('self-edit sends only email', async () => {
    let body: Record<string, unknown> | null = null;
    server.use(http.put('/api/v3/users/7', async ({ request }) => {
      body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ ...existing, email: 'new@example.com' });
    }));
    const { result } = renderHook(() => useAccountForm(existing, () => {}, { selfEdit: true }), { wrapper });
    expect(result.current.selfEdit).toBe(true);
    act(() => {
      result.current.setField('email', 'new@example.com');
      result.current.toggleEnabled();
    });
    act(() => result.current.submit());
    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toEqual({ email: 'new@example.com' });
  });
});

import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import type { User } from '@/types';
import { editPatch, useAccountForm } from './useAccountForm';

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

describe('useAccountForm — edit', () => {
  it('PUTs every field that changed, and only those', async () => {
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
      result.current.setField('language', 'de_de');
      result.current.setField('homeView', 'montage');
      result.current.toggleEnabled();
      result.current.toggleApiEnabled();
    });
    act(() => result.current.submit());

    await waitFor(() => expect(saved).toBe(1));
    expect(body).toEqual({
      email: 'new@example.com', name: 'Renamed', password: 'hunter22',
      language: 'de_de', home_view: 'montage', enabled: 0, api_enabled: 0,
    });
  });

  it('sends nothing and just closes when nothing changed', async () => {
    let hits = 0;
    server.use(http.put('/api/v3/users/7', () => { hits += 1; return HttpResponse.json(existing); }));
    let saved = 0;
    const { result } = renderHook(() => useAccountForm(existing, () => { saved += 1; }), { wrapper });
    act(() => result.current.submit());
    expect(saved).toBe(1);
    expect(hits).toBe(0);
  });

  it('editPatch: blank password is "keep", cleared language goes over as null', () => {
    const form = {
      username: 'ops', password: '', confirmPassword: '', name: 'Ops', email: 'ops@example.com', phone: '555',
      enabled: 1, language: '', homeView: 'console', apiEnabled: 1,
    };
    expect(editPatch({ ...existing, language: 'fr_fr', home_view: 'console' }, form, false)).toEqual({ language: null });
    expect(editPatch({ ...existing, home_view: 'console' }, { ...form, phone: '' }, false)).toEqual({ phone: '' });
  });

  it('only the username is fixed on edit; every field is free on create', () => {
    const edit = renderHook(() => useAccountForm(existing, () => {}), { wrapper });
    expect(edit.result.current.canChange('username')).toBe(false);
    for (const f of ['password', 'name', 'phone', 'email', 'enabled', 'language', 'homeView', 'apiEnabled'] as const) {
      expect(edit.result.current.canChange(f)).toBe(true);
    }
    const create = renderHook(() => useAccountForm(null, () => {}), { wrapper });
    expect(create.result.current.canChange('username')).toBe(true);
  });

  it('offers ZoneMinder language files, the site default, and keeps an unknown stored value', () => {
    const { result } = renderHook(() => useAccountForm({ ...existing, language: 'xx_yy' }, () => {}), { wrapper });
    const values = result.current.languages.map((o) => o.value);
    expect(values[0]).toBe('');
    expect(values).toContain('en_gb');
    expect(values).toContain('de_de');
    expect(values.at(-1)).toBe('xx_yy');
    expect(result.current.homeViews).toEqual(['console', 'events', 'map', 'montage', 'montagereview', 'watch']);
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
      result.current.setField('language', 'en_gb');
    });
    act(() => result.current.submit());
    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toMatchObject({
      username: 'new', password: 'pw', email: 'n@example.com', enabled: 1,
      language: 'en_gb', home_view: 'console', api_enabled: 1,
    });
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

  it('self-edit sends password, language and home view — nothing else', async () => {
    let body: Record<string, unknown> | null = null;
    server.use(http.put('/api/v3/users/7', async ({ request }) => {
      body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ ...existing, language: 'de_de' });
    }));
    const { result } = renderHook(() => useAccountForm(existing, () => {}, { selfEdit: true }), { wrapper });
    expect(result.current.selfEdit).toBe(true);
    expect(result.current.canChange('email')).toBe(false);
    expect(result.current.canChange('enabled')).toBe(false);
    expect(result.current.canChange('apiEnabled')).toBe(false);
    expect(result.current.canChange('password')).toBe(true);
    expect(result.current.canChange('language')).toBe(true);
    expect(result.current.canChange('homeView')).toBe(true);
    act(() => {
      result.current.setField('email', 'new@example.com');
      result.current.setField('language', 'de_de');
      result.current.setField('homeView', 'watch');
      result.current.setField('password', 'pw2');
      result.current.setField('confirmPassword', 'pw2');
      result.current.toggleEnabled();
    });
    act(() => result.current.submit());
    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toEqual({ password: 'pw2', language: 'de_de', home_view: 'watch' });
  });
});

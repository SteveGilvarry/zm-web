/**
 * The Options rail for pages that are not the Options page: one small
 * `/configs/categories` request instead of every config row, gated on
 * `ZM_OPT_X10` like legacy `options.php`.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { configListHandler } from '@/test/msw/handlers';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createElement, type ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import { useOptionsTabs } from './useOptionsTabs';

let categoryRequests = 0;
const CATEGORIES = [
  { category: 'system', count: 40 },
  { category: 'web', count: 30 },
  { category: 'hidden', count: 12 },
  { category: 'x10', count: 3 },
];

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({ accessToken: 't', refreshToken: 't', user: null, isAuthenticated: true });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => { server.resetHandlers(); categoryRequests = 0; });
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

function stub(x10: '0' | '1', categories: unknown[] = CATEGORIES) {
  server.use(
    http.get('/api/v3/configs/categories', () => {
      categoryRequests += 1;
      return HttpResponse.json(categories);
    }),
    configListHandler({ ZM_OPT_X10: x10 }),
  );
}

function wrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

describe('useOptionsTabs', () => {
  it('builds the legacy rail from the category counts, dropping hidden ones', async () => {
    stub('0');
    const { result } = renderHook(() => useOptionsTabs(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.length).toBeGreaterThan(7));

    expect(result.current.map((tab) => tab.key)).toEqual([
      'display', 'system', 'servers', 'storage', 'web', 'control', 'users', 'groups', 'state',
    ]);
    expect(result.current.find((tab) => tab.key === 'system'))
      .toEqual({ kind: 'category', key: 'system', category: 'system' });
    expect(result.current.find((tab) => tab.key === 'servers'))
      .toEqual({ kind: 'page', key: 'servers', to: '/settings/servers' });
  });

  it('adds the X10 tab once ZM_OPT_X10 is on', async () => {
    stub('1');
    const { result } = renderHook(() => useOptionsTabs(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.map((t) => t.key)).toContain('x10'));
    expect(result.current.find((tab) => tab.key === 'x10'))
      .toEqual({ kind: 'category', key: 'x10', category: 'x10' });
  });

  it('renders the page tabs before the categories arrive and asks once', async () => {
    stub('0');
    const { result } = renderHook(() => useOptionsTabs(), { wrapper: wrapper() });
    // Pre-fetch: page tabs only, no category tabs.
    expect(result.current.every((tab) => tab.kind === 'page')).toBe(true);

    await waitFor(() => expect(result.current.some((tab) => tab.kind === 'category')).toBe(true));
    expect(categoryRequests).toBe(1);
  });

  it('falls back to the page tabs when the category endpoint 500s', async () => {
    server.use(
      http.get('/api/v3/configs/categories', () =>
        HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'config table locked' }, { status: 500 })),
      configListHandler({ ZM_OPT_X10: '0' }),
    );
    const { result } = renderHook(() => useOptionsTabs(), { wrapper: wrapper() });
    await new Promise((r) => setTimeout(r, 30));

    expect(result.current.map((tab) => tab.key)).toEqual([
      'display', 'servers', 'storage', 'control', 'users', 'groups', 'state',
    ]);
  });

  it('falls back to the page tabs when the backend is unreachable', async () => {
    server.use(
      http.get('/api/v3/configs/categories', () => HttpResponse.error()),
      configListHandler({ ZM_OPT_X10: '0' }),
    );
    const { result } = renderHook(() => useOptionsTabs(), { wrapper: wrapper() });
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current.every((tab) => tab.kind === 'page')).toBe(true);
  });

  it('asks for nothing while signed out', async () => {
    stub('0');
    useAuthStore.setState({ isAuthenticated: false });
    try {
      const { result } = renderHook(() => useOptionsTabs(), { wrapper: wrapper() });
      await new Promise((r) => setTimeout(r, 30));
      expect(categoryRequests).toBe(0);
      expect(result.current.every((tab) => tab.kind === 'page')).toBe(true);
    } finally {
      useAuthStore.setState({ isAuthenticated: true });
    }
  });
});

/**
 * `MontageSort<groupIds>` user preference: the order legacy draws the review
 * wall in (`montagereview.php:66-80`).
 */
import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import type { Monitor } from '@/types';
import { applyMontageSort, montageSortName, useMontageSort } from './useMontageSort';

const m = (id: number): Monitor => ({ id, name: `Cam ${id}` } as unknown as Monitor);

describe('montageSortName', () => {
  it('appends the groups in play, as legacy does', () => {
    expect(montageSortName([])).toBe('MontageSort');
    expect(montageSortName([3, 4])).toBe('MontageSort3,4');
  });
});

describe('applyMontageSort', () => {
  it('orders the named monitors first, the rest after', () => {
    expect(applyMontageSort([m(1), m(2), m(3)], '3,1').map((x) => x.id)).toEqual([3, 1, 2]);
  });

  it('ignores ids that are not on screen', () => {
    expect(applyMontageSort([m(1), m(2)], '9,2').map((x) => x.id)).toEqual([2, 1]);
  });

  it('leaves the list alone with no preference or an unusable one', () => {
    expect(applyMontageSort([m(1), m(2)], null).map((x) => x.id)).toEqual([1, 2]);
    expect(applyMontageSort([m(1), m(2)], 'nonsense').map((x) => x.id)).toEqual([1, 2]);
  });
});

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({ accessToken: 't', refreshToken: 't', user: null, isAuthenticated: true });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

function stub(rows: Array<{ id: number; user_id: number; name: string; value: string }>) {
  server.use(http.get('/api/v3/user_preferences', () =>
    HttpResponse.json({ items: rows, total: rows.length, per_page: 200, current_page: 1, last_page: 1 })));
}

describe('useMontageSort', () => {
  it('prefers the group-specific preference over the plain one', async () => {
    stub([
      { id: 1, user_id: 7, name: 'MontageSort', value: '1,2' },
      { id: 2, user_id: 7, name: 'MontageSort5', value: '2,1' },
    ]);
    const { result } = renderHook(() => useMontageSort([5]), { wrapper });
    await waitFor(() => expect(result.current).toBe('2,1'));
  });

  it('falls back to the plain preference', async () => {
    stub([{ id: 1, user_id: 7, name: 'MontageSort', value: '3,1' }]);
    const { result } = renderHook(() => useMontageSort([9]), { wrapper });
    await waitFor(() => expect(result.current).toBe('3,1'));
  });

  it('is null when the user has never saved one', async () => {
    stub([]);
    const { result } = renderHook(() => useMontageSort([]), { wrapper });
    await waitFor(() => expect(result.current).toBeNull());
  });
});

import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import { useFiltersPage } from './useFiltersPage';

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

function wrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const savedFilter = {
  id: 7,
  name: 'High-score motion',
  query_json: JSON.stringify({
    rules: [{ field: 'max_score', operator: '>', value: '50', conjunction: 'and' }],
    actions: { auto_email: true, email_to: 'ops@example.com' },
    options: { background: true },
  }),
  auto_archive: 1,
  auto_delete: 0,
  execute_interval: 30,
};

function stub() {
  server.use(
    http.get('/api/v3/filters', () =>
      HttpResponse.json({ items: [savedFilter], total: 1, per_page: 200, current_page: 1, last_page: 1 }),
    ),
    http.get('/api/v3/monitors', () =>
      HttpResponse.json({ items: [], total: 0, per_page: 200, current_page: 1, last_page: 1 }),
    ),
  );
}

describe('useFiltersPage', () => {
  it('lists saved filters and starts with an empty, unsaveable draft', async () => {
    stub();
    const { result } = renderHook(() => useFiltersPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.filters).toHaveLength(1));
    expect(result.current.selectedId).toBeNull();
    expect(result.current.canSave).toBe(false);
    expect(result.current.anyActionOn).toBe(false);
  });

  it('loads a saved filter into the draft, including actions and options from query_json', async () => {
    stub();
    const { result } = renderHook(() => useFiltersPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.filters).toHaveLength(1));

    act(() => result.current.startEditing(result.current.filters[0]));
    expect(result.current.selectedId).toBe(7);
    expect(result.current.draftName).toBe('High-score motion');
    expect(result.current.draftAutoArchive).toBe(true);
    expect(result.current.draftInterval).toBe(30);
    expect(result.current.draftActions.email_to).toBe('ops@example.com');
    expect(result.current.draftOptions.background).toBe(true);
    expect(result.current.anyActionOn).toBe(true);
    expect(result.current.canSave).toBe(true);

    const composed = JSON.parse(result.current.composeQueryJson());
    expect(composed.actions.auto_archive).toBe(true);
    expect(composed.actions.auto_delete).toBe(false);
    expect(composed.options).toEqual({ background: true });

    act(() => result.current.startEditing(null));
    expect(result.current.selectedId).toBeNull();
    expect(result.current.draftName).toBe('');
  });

  it('POSTs the composed payload on create and selects the new filter', async () => {
    stub();
    let body: Record<string, unknown> = {};
    server.use(
      http.post('/api/v3/filters', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...savedFilter, id: 8, name: body.name });
      }),
    );
    const { result } = renderHook(() => useFiltersPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.filters).toHaveLength(1));

    act(() => result.current.setDraftName('  New one '));
    act(() => result.current.toggleAutoDelete());
    act(() => result.current.create());

    await waitFor(() => expect(result.current.selectedId).toBe(8));
    expect(body.name).toBe('New one');
    expect(JSON.parse(body.query_json as string).actions.auto_delete).toBe(true);
  });
});

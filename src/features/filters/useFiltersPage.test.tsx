import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import { useFiltersPage, columnsOf } from './useFiltersPage';
import { PURGE_WHEN_FULL_QUERY_JSON, PURGE_WHEN_FULL_ROW, UPDATE_DISK_SPACE_ROW } from './liveFixtures';

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

const legacyPrivateFormat = {
  ...UPDATE_DISK_SPACE_ROW,
  id: 9,
  name: 'Old dashboard filter',
  query_json: JSON.stringify({ rules: [{ field: 'cause', operator: 'contains', value: 'x' }] }),
  filter: undefined,
};

function stub(items: unknown[] = [PURGE_WHEN_FULL_ROW, UPDATE_DISK_SPACE_ROW, legacyPrivateFormat]) {
  server.use(
    http.get('/api/v3/filters', () =>
      HttpResponse.json({ items, total: items.length, per_page: 200, current_page: 1, last_page: 1 }),
    ),
    http.get('/api/v3/monitors', () =>
      HttpResponse.json({ items: [], total: 0, per_page: 200, current_page: 1, last_page: 1 }),
    ),
    http.get('/api/v3/storage', () =>
      HttpResponse.json({ items: [{ id: 1, name: 'Default', path: '/e', type: 'local', enabled: 1 }], total: 1, per_page: 200, current_page: 1, last_page: 1 }),
    ),
  );
}

describe('useFiltersPage', () => {
  it('lists saved filters and starts with an empty, unsaveable draft', async () => {
    stub();
    const { result } = renderHook(() => useFiltersPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.filters).toHaveLength(3));
    await waitFor(() => expect(result.current.storage).toHaveLength(1));
    expect(result.current.selectedId).toBeNull();
    expect(result.current.canSave).toBe(false);
    expect(result.current.anyActionOn).toBe(false);
    expect(result.current.draftQuery?.terms).toEqual([]);
    expect(result.current.draftColumns.execute_interval).toBe(60);
  });

  it('loads PurgeWhenFull: terms from query_json, actions/options from the columns', async () => {
    stub();
    const { result } = renderHook(() => useFiltersPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.filters).toHaveLength(3));

    act(() => result.current.startEditing(result.current.filters[0]));
    expect(result.current.selectedId).toBe(1);
    expect(result.current.draftName).toBe('PurgeWhenFull');
    expect(result.current.unreadable).toBeNull();
    expect(result.current.draftQuery?.terms).toHaveLength(3);
    expect(result.current.draftQuery?.sort_field).toBe('Id');
    expect(result.current.draftColumns.auto_delete).toBe(1);
    expect(result.current.draftColumns.background).toBe(1);
    expect(result.current.draftColumns.execute_interval).toBe(60);
    expect(result.current.anyActionOn).toBe(true);
    expect(result.current.canSave).toBe(true);
    expect(result.current.deleteEverythingRisk).toBe(false);
    expect(result.current.composeQueryJson()).toBe(PURGE_WHEN_FULL_QUERY_JSON);

    act(() => result.current.startEditing(null));
    expect(result.current.selectedId).toBeNull();
    expect(result.current.draftName).toBe('');
  });

  it('refuses to save a filter whose query_json it cannot read', async () => {
    stub();
    const { result } = renderHook(() => useFiltersPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.filters).toHaveLength(3));

    act(() => result.current.startEditing(result.current.filters[2]));
    expect(result.current.draftQuery).toBeNull();
    expect(result.current.unreadable).toMatchObject({ raw: legacyPrivateFormat.query_json });
    expect(result.current.canSave).toBe(false);
    expect(result.current.composeQueryJson()).toBe('');
  });

  it('PUTs query_json and every column on save, unchanged for an untouched filter', async () => {
    stub();
    let body: Record<string, unknown> = {};
    server.use(
      http.put('/api/v3/filters/1', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(PURGE_WHEN_FULL_ROW);
      }),
    );
    const { result } = renderHook(() => useFiltersPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.filters).toHaveLength(3));
    act(() => result.current.startEditing(result.current.filters[0]));
    act(() => result.current.save());
    await waitFor(() => expect(body.query_json).toBe(PURGE_WHEN_FULL_QUERY_JSON));
    expect(body).toMatchObject({
      name: 'PurgeWhenFull',
      auto_delete: 1, background: 1, execute_interval: 60, auto_archive: 0,
      auto_unarchive: 0, update_disk_space: 0, auto_upload: 0, lock_rows: 0, concurrent: 0,
      email_format: 'Individual', user_id: 1,
    });
    expect(body).not.toHaveProperty('query');
  });

  it('flags the delete-everything case and POSTs columns + terms on create', async () => {
    stub();
    let body: Record<string, unknown> = {};
    server.use(
      http.post('/api/v3/filters', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...PURGE_WHEN_FULL_ROW, id: 8, name: body.name }, { status: 201 });
      }),
    );
    const { result } = renderHook(() => useFiltersPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.filters).toHaveLength(3));

    act(() => result.current.setDraftName('  New one '));
    act(() => result.current.toggleFlag('auto_delete'));
    expect(result.current.deleteEverythingRisk).toBe(true);
    act(() => result.current.setDraftQuery({ ...result.current.draftQuery!, terms: [{ attr: 'Archived', op: '=', val: '0' }] }));
    expect(result.current.deleteEverythingRisk).toBe(false);
    act(() => result.current.setColumn('execute_interval', 300));
    act(() => result.current.toggleFlag('background'));
    act(() => result.current.setColumn('auto_copy_to', 1));
    act(() => result.current.create());

    await waitFor(() => expect(result.current.selectedId).toBe(8));
    expect(body.name).toBe('New one');
    expect(body.query_json).toBe('{"terms":[{"attr":"Archived","op":"=","val":"0"}],"sort_field":"StartDateTime","sort_asc":"0","limit":"0","skip_locked":"0"}');
    expect(body).toMatchObject({ auto_delete: 1, background: 1, execute_interval: 300, auto_copy_to: 1, auto_copy: 0 });
  });
});

describe('columnsOf', () => {
  it('fills columns the backend omitted with the schema defaults', () => {
    const partial = { id: 3, name: 'x', query_json: '', auto_delete: 1 } as unknown as typeof PURGE_WHEN_FULL_ROW;
    const cols = columnsOf(partial);
    expect(cols.auto_delete).toBe(1);
    expect(cols.auto_archive).toBe(0);
    expect(cols.execute_interval).toBe(60);
    expect(cols.email_format).toBe('Individual');
    expect(cols.user_id).toBeNull();
  });
});

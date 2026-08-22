/**
 * useFiltersPage — the URL contract (`?id=`, `?terms=`), the Save As /
 * Reset / Delete verbs, and the error paths. The saved-row list is the
 * source of truth for selection, so the tests assert what goes into
 * `navigate()` as well as what goes over the wire.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/components/common/toastStore';
import { useFiltersPage, termsFromSearch } from './useFiltersPage';
import { PURGE_WHEN_FULL_ROW, UPDATE_DISK_SPACE_ROW } from './liveFixtures';

let mockSearch: Record<string, unknown> = {};
const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useSearch: () => mockSearch,
  useNavigate: () => mockNavigate,
}));

/** A row whose query_json the editor cannot read — it must never be overwritten. */
const unreadableRow = {
  ...UPDATE_DISK_SPACE_ROW,
  id: 9,
  name: 'Old dashboard filter',
  query_json: JSON.stringify({ rules: [{ field: 'cause', operator: 'contains', value: 'x' }] }),
  filter: undefined,
};

let posted: unknown[] = [];
let put: Array<{ id: string; body: unknown }> = [];
let deleted: string[] = [];
let listHits = 0;

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test',
    user: { user: 'admin', iat: 0, exp: 0 } as never, isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  server.resetHandlers();
  mockSearch = {}; mockNavigate.mockReset();
  posted = []; put = []; deleted = []; listHits = 0;
  useToastStore.getState().clear();
});
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

function stub(items: unknown[] = [PURGE_WHEN_FULL_ROW, UPDATE_DISK_SPACE_ROW, unreadableRow]) {
  server.use(
    http.get('/api/v3/filters', () => {
      listHits++;
      return HttpResponse.json({ items, total: items.length, per_page: 200, current_page: 1, last_page: 1 });
    }),
    http.post('/api/v3/filters', async ({ request }) => {
      const body = await request.json();
      posted.push(body);
      return HttpResponse.json({ id: 77, ...(body as object) });
    }),
    http.put('/api/v3/filters/:id', async ({ params, request }) => {
      put.push({ id: String(params.id), body: await request.json() });
      return HttpResponse.json({ id: Number(params.id) });
    }),
    http.delete('/api/v3/filters/:id', ({ params }) => {
      deleted.push(String(params.id));
      return new HttpResponse(null, { status: 204 });
    }),
    http.get('/api/v3/monitors', () =>
      HttpResponse.json({ items: [], total: 0, per_page: 200, current_page: 1, last_page: 1 })),
    http.get('/api/v3/users', () =>
      HttpResponse.json({ items: [{ id: 1, username: 'admin' }], total: 1, per_page: 100, current_page: 1, last_page: 1 })),
    http.get('/api/v3/storage', () =>
      HttpResponse.json({ items: [], total: 0, per_page: 200, current_page: 1, last_page: 1 })),
  );
}

function wrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

async function mounted() {
  const hook = renderHook(() => useFiltersPage(), { wrapper: wrapper() });
  await waitFor(() => expect(hook.result.current.filters.length).toBeGreaterThan(0));
  return hook;
}

/* ======================================================================== */

describe('termsFromSearch', () => {
  it('accepts a JSON array of ZoneMinder terms and normalises the conjunctions', () => {
    const out = termsFromSearch(JSON.stringify([
      { cnj: 'or', attr: 'Cause', op: '=', val: 'Motion' },
      { attr: 'Frames', op: '>', val: '10' },
    ]));
    expect(out).toEqual([
      { attr: 'Cause', op: '=', val: 'Motion' },
      { cnj: 'and', attr: 'Frames', op: '>', val: '10' },
    ]);
  });

  it('refuses anything that is not a term array', () => {
    expect(termsFromSearch(undefined)).toBeNull();
    expect(termsFromSearch('')).toBeNull();
    expect(termsFromSearch('not json')).toBeNull();
    expect(termsFromSearch('{"terms":[]}')).toBeNull();
    expect(termsFromSearch('[{"nope":1}]')).toBeNull();
    expect(termsFromSearch('[null]')).toBeNull();
  });
});

describe('useFiltersPage — ?terms= seeds a new filter', () => {
  it('opens an unsaved draft carrying the terms from the Events list', async () => {
    mockSearch = { terms: JSON.stringify([{ attr: 'MonitorId', op: '=', val: '3' }]) };
    stub();
    const { result } = await mounted();
    expect(result.current.selectedId).toBeNull();
    expect(result.current.draftQuery?.terms).toEqual([{ attr: 'MonitorId', op: '=', val: '3' }]);
    expect(result.current.canSave).toBe(false); // still needs a name
  });
});

describe('useFiltersPage — ?id= selects a saved filter', () => {
  it('loads the row once the list arrives', async () => {
    mockSearch = { id: 2 };
    stub();
    const { result } = await mounted();
    await waitFor(() => expect(result.current.selectedId).toBe(2));
    expect(result.current.draftName).toBe('Update DiskSpace');
    expect(result.current.draftColumns.update_disk_space).toBe(1);
  });

  it('leaves the form alone for an id the list does not contain', async () => {
    mockSearch = { id: 4242 };
    stub();
    const { result } = await mounted();
    expect(result.current.selectedId).toBeNull();
    expect(result.current.draftName).toBe('');
  });

  it('shows the raw query_json of a filter it cannot read, and refuses to save over it', async () => {
    mockSearch = { id: 9 };
    stub();
    const { result } = await mounted();
    await waitFor(() => expect(result.current.selectedId).toBe(9));
    expect(result.current.draftQuery).toBeNull();
    expect(result.current.unreadable?.raw).toContain('"operator":"contains"');
    expect(result.current.canSave).toBe(false);

    await act(async () => { result.current.save(); });
    await waitFor(() =>
      expect(useToastStore.getState().toasts.some((t) => t.tone === 'error')).toBe(true));
    expect(put).toHaveLength(0);
  });
});

describe('useFiltersPage — selection writes the URL', () => {
  it('selecting a row replaces ?id=, and clearing it empties the search', async () => {
    stub();
    const { result } = await mounted();

    act(() => result.current.startEditing(result.current.filters[0]));
    expect(result.current.selectedId).toBe(1);
    const [selectArg] = mockNavigate.mock.calls.at(-1)!;
    expect(selectArg).toMatchObject({ replace: true });
    expect((selectArg as { search: () => unknown }).search()).toEqual({ id: 1 });

    act(() => result.current.startEditing(null));
    expect(result.current.selectedId).toBeNull();
    expect(result.current.draftName).toBe('');
    const [clearArg] = mockNavigate.mock.calls.at(-1)!;
    expect((clearArg as { search: () => unknown }).search()).toEqual({});
  });
});

describe('useFiltersPage — Save As / Reset / Delete', () => {
  it('Save As POSTs a copy under the new name and selects it', async () => {
    stub();
    const { result } = await mounted();
    act(() => result.current.startEditing(result.current.filters[0]));

    await act(async () => { result.current.saveAs('  PurgeWhenFull copy  '); });
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ name: 'PurgeWhenFull copy', auto_delete: 1 });
    expect((posted[0] as { query_json: string }).query_json).toContain('"attr":"Archived"');

    await waitFor(() => expect(result.current.selectedId).toBe(77));
    const [arg] = mockNavigate.mock.calls.at(-1)!;
    expect((arg as { search: () => unknown }).search()).toEqual({ id: 77 });
    expect(useToastStore.getState().toasts.some((t) => /saved/.test(t.message))).toBe(true);
  });

  it('Save As with a blank name sends nothing', async () => {
    stub();
    const { result } = await mounted();
    await act(async () => { result.current.saveAs('   '); });
    expect(posted).toHaveLength(0);
  });

  it('Reset puts the saved row back into the editor', async () => {
    stub();
    const { result } = await mounted();
    act(() => result.current.startEditing(result.current.filters[0]));
    act(() => { result.current.setDraftName('scratch'); result.current.toggleFlag('auto_email'); });
    expect(result.current.draftColumns.auto_email).toBe(1);

    act(() => result.current.reset());
    expect(result.current.draftName).toBe('PurgeWhenFull');
    expect(result.current.draftColumns.auto_email).toBe(0);
  });

  it('Reset on an unsaved draft clears the form', async () => {
    stub();
    const { result } = await mounted();
    act(() => result.current.setDraftName('scratch'));
    act(() => result.current.reset());
    expect(result.current.draftName).toBe('');
    expect(result.current.selectedId).toBeNull();
  });

  it('Delete removes the row and drops back to a blank form', async () => {
    stub();
    const { result } = await mounted();
    act(() => result.current.startEditing(result.current.filters[0]));

    await act(async () => { result.current.remove(1); });
    await waitFor(() => expect(deleted).toEqual(['1']));
    await waitFor(() => expect(result.current.selectedId).toBeNull());
    expect(result.current.draftName).toBe('');
  });

  it('reports a delete the backend refuses', async () => {
    stub();
    server.use(http.delete('/api/v3/filters/:id', () =>
      HttpResponse.json({ kind: 'FORBIDDEN', error_message: 'not yours' }, { status: 403 })));
    const { result } = await mounted();
    act(() => result.current.startEditing(result.current.filters[0]));

    await act(async () => { result.current.remove(1); });
    await waitFor(() =>
      expect(useToastStore.getState().toasts.some((t) => t.tone === 'error')).toBe(true));
    expect(result.current.selectedId).toBe(1);
  });

  it('saving with nothing selected surfaces the refusal instead of PUTting', async () => {
    stub();
    const { result } = await mounted();
    await act(async () => { result.current.save(); });
    await waitFor(() => expect(result.current.saveError).toBeTruthy());
    expect(put).toHaveLength(0);
  });
});

describe('useFiltersPage — debug', () => {
  it('prefers the backend AST for a saved row that carries one', async () => {
    stub();
    const { result } = await mounted();
    act(() => result.current.startEditing(result.current.filters[1])); // UPDATE_DISK_SPACE_ROW has `filter`
    expect(result.current.debug).toMatchObject({ source: 'backend', ast: null });
    expect(result.current.debug?.backendAst).toBeTruthy();
  });

  it('falls back to our own AST for an unsaved draft', async () => {
    stub();
    const { result } = await mounted();
    act(() => result.current.setDraftQuery({ terms: [{ attr: 'Id', op: '>', val: '0' }] }));
    expect(result.current.debug).toMatchObject({ source: 'draft', backendAst: null });
    expect(result.current.debug?.ast).toMatchObject({ ok: true });
  });
});

describe('useFiltersPage — error paths', () => {
  it('surfaces a 500 on the list and can be retried', async () => {
    server.use(
      http.get('/api/v3/filters', () => {
        listHits++;
        return HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'Filters is locked' }, { status: 500 });
      }),
      http.get('/api/v3/monitors', () => HttpResponse.json({ items: [], total: 0, per_page: 200, current_page: 1, last_page: 1 })),
      http.get('/api/v3/users', () => HttpResponse.json({ items: [], total: 0, per_page: 100, current_page: 1, last_page: 1 })),
      http.get('/api/v3/storage', () => HttpResponse.json({ items: [], total: 0, per_page: 200, current_page: 1, last_page: 1 })),
    );
    const { result } = renderHook(() => useFiltersPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBeTruthy();

    const before = listHits;
    act(() => result.current.refetch());
    await waitFor(() => expect(listHits).toBeGreaterThan(before));
  });

  it('surfaces the backend being unreachable', async () => {
    server.use(
      http.get('/api/v3/filters', () => HttpResponse.error()),
      http.get('/api/v3/monitors', () => HttpResponse.json({ items: [], total: 0, per_page: 200, current_page: 1, last_page: 1 })),
      http.get('/api/v3/users', () => HttpResponse.json({ items: [], total: 0, per_page: 100, current_page: 1, last_page: 1 })),
      http.get('/api/v3/storage', () => HttpResponse.json({ items: [], total: 0, per_page: 200, current_page: 1, last_page: 1 })),
    );
    const { result } = renderHook(() => useFiltersPage(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.filters).toEqual([]);
  });

  it('an operator without events:Edit cannot save, and users are not fetched without system:View', async () => {
    useAuthStore.setState({ user: { iat: 0, exp: 0, user: 'viewer', perms: { events: 'View' } } as never });
    stub();
    const { result } = await mounted();
    act(() => result.current.setDraftName('anything'));
    expect(result.current.canEdit).toBe(false);
    expect(result.current.canSave).toBe(false);
    expect(result.current.users).toEqual([]);
    useAuthStore.setState({ user: { user: 'admin', iat: 0, exp: 0 } as never });
  });
});

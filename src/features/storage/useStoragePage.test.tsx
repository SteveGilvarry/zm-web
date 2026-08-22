/**
 * The skin-agnostic half of Settings → Storage: the derived list rows (server
 * name, disk-space bar) and the form's round-trip through the full
 * `StorageResponse` row that zm-api#24 added.
 */
import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth';
import { makeServer, makeStorage } from '@/test/fixtures/admin';
import { useStoragePage } from './useStoragePage';

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', isAuthenticated: true,
    user: { user: 'admin', iat: 0, exp: 4102444800 } as never,
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
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const paged = (items: unknown[]) => ({
  items, total: items.length, per_page: 25, current_page: 1, last_page: 1,
});

const DEFAULT_ROW = makeStorage({ disk_space: 40_000_000_000, server_id: 0 });
const COLD_ROW = makeStorage({
  id: 2, name: 'Cold', path: '/mnt/cold', type: 's3fs', enabled: 0,
  scheme: 'Deep', server_id: 7, url: 's3://bucket/zm', disk_space: 10_000_000_000, do_delete: 0,
});

function seed(storage: unknown[] = [DEFAULT_ROW, COLD_ROW], servers: unknown[] = [makeServer({ id: 7, name: 'zm-node-7' })]) {
  const sent: Array<{ method: string; id: string | null; body: unknown }> = [];
  server.use(
    http.get('/api/v3/storage', () => HttpResponse.json(paged(storage))),
    http.get('/api/v3/servers', () => HttpResponse.json(paged(servers))),
    http.post('/api/v3/storage', async ({ request }) => {
      const body = await request.json();
      sent.push({ method: 'POST', id: null, body });
      return HttpResponse.json({ id: 9, ...(body as object) });
    }),
    http.patch('/api/v3/storage/:id', async ({ request, params }) => {
      const body = await request.json();
      sent.push({ method: 'PATCH', id: params.id as string, body });
      return HttpResponse.json({ id: Number(params.id), ...(body as object) });
    }),
  );
  return sent;
}

async function mounted(...args: Parameters<typeof seed>) {
  const sent = seed(...args);
  const hook = renderHook(() => useStoragePage(), { wrapper: wrapper() });
  await waitFor(() => expect(hook.result.current.rows).toHaveLength(
    (args[0] ?? [DEFAULT_ROW, COLD_ROW]).length,
  ));
  return { ...hook, sent };
}

describe('useStoragePage rows', () => {
  it('resolves the server name and folds ServerId 0 into "no server"', async () => {
    const { result } = await mounted();
    await waitFor(() => expect(result.current.rows[1].serverName).toBe('zm-node-7'));

    const [dflt, cold] = result.current.rows;
    // ZoneMinder writes 0 for "reachable from every server".
    expect(dflt.serverId).toBeNull();
    expect(dflt.serverName).toBeNull();
    expect(cold.serverId).toBe(7);
  });

  it('leaves the name unresolved when /servers does not know the id', async () => {
    const { result } = await mounted([COLD_ROW], []);
    expect(result.current.rows[0]).toMatchObject({ serverId: 7, serverName: null });
  });

  it('scales the disk-space bar against the largest listed area', async () => {
    const { result } = await mounted();
    // 40GB is the biggest of the two, so it pegs the bar; 10GB is a quarter.
    expect(result.current.rows.map((r) => r.diskPercent)).toEqual([100, 25]);
  });

  it('has no bar for an area zmaudit has not costed', async () => {
    const { result } = await mounted([makeStorage({ disk_space: null })]);
    expect(result.current.rows[0].diskPercent).toBeNull();
  });

  it('has no bar at all when every listed area is uncosted', async () => {
    const { result } = await mounted([
      makeStorage({ disk_space: null }),
      makeStorage({ id: 2, name: 'Cold', disk_space: 0 }),
    ]);
    expect(result.current.rows.map((r) => r.diskPercent)).toEqual([null, null]);
  });

  it('narrows the rows with the search box', async () => {
    const { result } = await mounted();
    act(() => result.current.setSearchQuery('/mnt/cold'));
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(result.current.rows[0].storage.name).toBe('Cold');
    // The bar rescales to what is on screen.
    expect(result.current.rows[0].diskPercent).toBe(100);
  });
});

describe('useStoragePage form', () => {
  it('opens the edit form on the row as stored, not on defaults', async () => {
    const { result } = await mounted();
    act(() => result.current.openEdit(COLD_ROW));
    expect(result.current.formData).toEqual({
      name: 'Cold', path: '/mnt/cold', type: 's3fs', enabled: 0,
      scheme: 'Deep', server_id: 7, url: 's3://bucket/zm',
    });
  });

  it('normalises a stored ServerId of 0 and a null url for the pickers', async () => {
    const { result } = await mounted();
    act(() => result.current.openEdit(DEFAULT_ROW));
    expect(result.current.formData).toMatchObject({ scheme: 'Medium', server_id: null, url: '' });
  });

  it('PATCHes the whole row, scheme included', async () => {
    const { result, sent } = await mounted();
    act(() => result.current.openEdit(COLD_ROW));
    act(() => result.current.setField('scheme', 'Shallow'));
    act(() => result.current.submitForm());

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({
      method: 'PATCH', id: '2',
      body: {
        name: 'Cold', path: '/mnt/cold', type: 's3fs', enabled: 0,
        scheme: 'Shallow', server_id: 7, url: 's3://bucket/zm',
      },
    });
  });

  it('blanks out to null on the wire rather than storing empty strings', async () => {
    const { result, sent } = await mounted();
    act(() => result.current.openEdit(COLD_ROW));
    act(() => result.current.setField('url', '   '));
    act(() => result.current.setField('server_id', null));
    act(() => result.current.submitForm());

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].body).toMatchObject({ url: null, server_id: null });
  });

  it('opens the create form on defaults after an edit', async () => {
    const { result } = await mounted();
    act(() => result.current.openEdit(COLD_ROW));
    act(() => result.current.openCreate());
    expect(result.current.formData).toEqual({
      name: '', path: '', type: 'local', enabled: 1, scheme: 'Medium', server_id: null, url: '',
    });
  });
});

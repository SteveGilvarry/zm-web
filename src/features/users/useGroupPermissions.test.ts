/**
 * `useGroupPermissions` — the per-group override matrix for one user.
 *
 * Rows follow the group *tree* (depth-first, indented by `depth`) and each
 * carries the group's monitor names as a sublabel, matching legacy's
 * `Group.MonitorIds` column. `Inherit` is the absence of a row, so choosing
 * it DELETEs; anything else upserts.
 */
import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/components/common/toastStore';
import { useGroupPermissions } from './useGroupPermissions';

const paged = (items: unknown[]) =>
  HttpResponse.json({ items, total: items.length, per_page: 1000, current_page: 1, last_page: 1 });

interface Sent { method: string; url: string; body?: unknown }
let sent: Sent[] = [];

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({ accessToken: 't', refreshToken: 't', user: null, isAuthenticated: true });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  server.resetHandlers();
  sent = [];
  useToastStore.getState().clear();
});
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

function wrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

const mon = (id: number, name: string) => ({
  id, name, width: 1920, height: 1080, orientation: 'ROTATE_0', type: 'Ffmpeg',
  capturing: 'Always', analysing: 'Always', recording: 'OnMotion',
});

/** Outside (root) → Perimeter (child of Outside); Inside (root, no monitors). */
function stubAll(over: {
  groups?: unknown[];
  perms?: unknown[];
  groupMonitors?: unknown[];
  monitors?: unknown[];
} = {}) {
  server.use(
    http.get('/api/v3/groups', () => paged(over.groups ?? [
      { id: 1, name: 'Outside', parent_id: null },
      { id: 2, name: 'Perimeter', parent_id: 1 },
      { id: 3, name: 'Inside', parent_id: 0 },
    ])),
    http.get('/api/v3/groups-permissions', () => paged(over.perms ?? [
      { id: 201, group_id: 2, user_id: 7, permission: 'Edit' },
      { id: 202, group_id: 1, user_id: 99, permission: 'View' }, // other user — ignored
    ])),
    http.get('/api/v3/groups-monitors', () => paged(over.groupMonitors ?? [
      { id: 1, group_id: 1, monitor_id: 10 },
      { id: 2, group_id: 1, monitor_id: 11 },
      { id: 3, group_id: 2, monitor_id: 99 }, // unknown monitor id → falls back to "#99"
    ])),
    http.get('/api/v3/monitors', () => paged(over.monitors ?? [
      mon(10, 'Front Door'), mon(11, 'Driveway'),
    ])),
  );
}

function stubMutations() {
  server.use(
    http.post('/api/v3/groups-permissions', async ({ request }) => {
      sent.push({ method: 'POST', url: new URL(request.url).pathname, body: await request.json() });
      return HttpResponse.json({ id: 500, group_id: 1, user_id: 7, permission: 'View' });
    }),
    http.patch('/api/v3/groups-permissions/:id', async ({ request, params }) => {
      sent.push({ method: 'PATCH', url: `/api/v3/groups-permissions/${params.id}`, body: await request.json() });
      return HttpResponse.json({ id: Number(params.id), group_id: 2, user_id: 7, permission: 'View' });
    }),
    http.delete('/api/v3/groups-permissions/:id', ({ params }) => {
      sent.push({ method: 'DELETE', url: `/api/v3/groups-permissions/${params.id}` });
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

async function mount(userId = 7) {
  const hook = renderHook(() => useGroupPermissions(userId), { wrapper: wrapper() });
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook;
}

describe('useGroupPermissions — rows', () => {
  it('renders the group tree in depth order with monitor names as the sublabel', async () => {
    stubAll();
    const { result } = await mount();

    await waitFor(() => expect(result.current.rows).toHaveLength(3));
    expect(result.current.hasGroups).toBe(true);

    const [outside, perimeter, inside] = result.current.rows;
    expect(outside).toMatchObject({
      key: 'group-1', label: 'Outside', depth: 0, value: 'Inherit', sublabel: 'Front Door, Driveway',
    });
    // Child sits immediately after its parent, one level in.
    expect(perimeter).toMatchObject({ key: 'group-2', label: 'Perimeter', depth: 1, value: 'Edit' });
    // Unknown monitor ids degrade to "#id" rather than disappearing.
    expect(perimeter.sublabel).toBe('#99');
    // parent_id 0 is legacy for "no parent", so Inside is a root with no monitors.
    expect(inside).toMatchObject({ key: 'group-3', label: 'Inside', depth: 0, value: 'Inherit' });
    expect(inside.sublabel).toBeUndefined();

    expect(outside.options).toEqual(['Inherit', 'None', 'View', 'Edit']);
  });

  it('ignores rows belonging to a different user', async () => {
    stubAll();
    const { result } = await mount(99);

    await waitFor(() => expect(result.current.rows).toHaveLength(3));
    // Only group 1 is set for user 99.
    expect(result.current.rows.map((r) => r.value)).toEqual(['View', 'Inherit', 'Inherit']);
  });

  it('reports the empty state when the install has no groups', async () => {
    stubAll({ groups: [], groupMonitors: [] });
    const { result } = await mount();

    await waitFor(() => expect(result.current.hasGroups).toBe(false));
    expect(result.current.rows).toEqual([]);
  });
});

describe('useGroupPermissions — setLevel', () => {
  it('POSTs a new row for a group with no override', async () => {
    stubAll();
    stubMutations();
    const { result } = await mount();
    await waitFor(() => expect(result.current.rows).toHaveLength(3));

    act(() => result.current.setLevel('group-1', 'View'));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({
      method: 'POST',
      url: '/api/v3/groups-permissions',
      body: { group_id: 1, user_id: 7, permission: 'View' },
    });
  });

  it('PATCHes the existing row when the group already has an override', async () => {
    stubAll();
    stubMutations();
    const { result } = await mount();
    await waitFor(() => expect(result.current.rows).toHaveLength(3));

    act(() => result.current.setLevel('group-2', 'View'));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({
      method: 'PATCH',
      url: '/api/v3/groups-permissions/201',
      body: { permission: 'View' },
    });
  });

  it('DELETEs the row when the level returns to Inherit', async () => {
    stubAll();
    stubMutations();
    const { result } = await mount();
    await waitFor(() => expect(result.current.rows).toHaveLength(3));

    act(() => result.current.setLevel('group-2', 'Inherit'));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ method: 'DELETE', url: '/api/v3/groups-permissions/201' });
  });

  it('sends nothing when Inherit is picked for a group that has no row', async () => {
    stubAll();
    stubMutations();
    const { result } = await mount();
    await waitFor(() => expect(result.current.rows).toHaveLength(3));

    act(() => result.current.setLevel('group-3', 'Inherit'));

    await waitFor(() => expect(result.current.rows).toHaveLength(3));
    expect(sent).toEqual([]);
  });

  it('toasts a plain-language refusal when the write comes back 403', async () => {
    stubAll();
    server.use(
      http.post('/api/v3/groups-permissions', () =>
        HttpResponse.json({ kind: 'FORBIDDEN', error_message: 'system Edit required' }, { status: 403 })),
    );
    const { result } = await mount();
    await waitFor(() => expect(result.current.rows).toHaveLength(3));

    act(() => result.current.setLevel('group-1', 'Edit'));

    await waitFor(() => expect(useToastStore.getState().toasts).toHaveLength(1));
    const [toast] = useToastStore.getState().toasts;
    expect(toast.tone).toBe('error');
    expect(toast.message).toBe('You do not have permission to do this.');
  });

  it('toasts the backend message when the write fails for a non-permission reason', async () => {
    stubAll();
    server.use(
      http.post('/api/v3/groups-permissions', () =>
        HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'groups_permissions is locked' }, { status: 500 })),
    );
    const { result } = await mount();
    await waitFor(() => expect(result.current.rows).toHaveLength(3));

    act(() => result.current.setLevel('group-1', 'Edit'));

    await waitFor(() => expect(useToastStore.getState().toasts).toHaveLength(1));
    expect(useToastStore.getState().toasts[0].message).toMatch(/groups_permissions is locked/);
  });
});

describe('useGroupPermissions — failure paths', () => {
  it('renders no rows when the groups list 500s', async () => {
    stubAll();
    server.use(
      http.get('/api/v3/groups', () =>
        HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'groups table locked' }, { status: 500 })),
    );
    const { result } = await mount();

    expect(result.current.rows).toEqual([]);
    expect(result.current.hasGroups).toBe(false);
  });

  it('still lists the groups when the monitor/group-monitor lookups fail on the network', async () => {
    stubAll();
    server.use(
      http.get('/api/v3/monitors', () => HttpResponse.error()),
      http.get('/api/v3/groups-monitors', () => HttpResponse.error()),
    );
    const { result } = await mount();

    await waitFor(() => expect(result.current.rows).toHaveLength(3));
    expect(result.current.rows.every((r) => r.sublabel === undefined)).toBe(true);
  });

  it('reports isLoading until groups and permissions have both settled', async () => {
    stubAll();
    const { result } = renderHook(() => useGroupPermissions(7), { wrapper: wrapper() });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.rows).toEqual([]);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });
});

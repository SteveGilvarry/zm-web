/**
 * `useMonitorPermissions` — the per-monitor override matrix for one user.
 *
 * The interesting behaviour is the three-layer effective level (monitor
 * override → most permissive group → global `monitors`) and the fact that
 * `Inherit` is *the absence of a row*, so picking it DELETEs rather than
 * PATCHing.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/components/common/toastStore';
import type { User } from '@/types';
import { useMonitorPermissions } from './useMonitorPermissions';

const paged = (items: unknown[]) =>
  HttpResponse.json({ items, total: items.length, per_page: 1000, current_page: 1, last_page: 1 });

/** Requests captured so we can assert method + URL + body. */
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

const mon = (id: number, name: string, extra: Record<string, unknown> = {}) => ({
  id, name, width: 1920, height: 1080, orientation: 'ROTATE_0', type: 'Ffmpeg',
  capturing: 'Always', analysing: 'Always', recording: 'OnMotion', ...extra,
});

const testUser = (over: Partial<User> = {}): User => ({
  id: 7, username: 'operator', name: 'Ops', email: 'ops@example.com', enabled: 1,
  system: 'None', stream: 'View', events: 'View', control: 'None',
  monitors: 'View', groups: 'None', devices: 'None', snapshots: 'None', ...over,
});

/**
 * Default dataset: monitors 1..3, monitor 1 has an explicit `Edit` override
 * for user 7, monitor 2 belongs to groups 10 and 11 (user has None on 10 and
 * Edit on 11), monitor 3 has nothing and falls back to the global level.
 */
function stubAll(over: {
  monitors?: unknown[];
  monitorPerms?: unknown[];
  groupPerms?: unknown[];
  groupMonitors?: unknown[];
} = {}) {
  server.use(
    http.get('/api/v3/monitors', () => paged(over.monitors ?? [
      mon(1, 'Front Door'), mon(2, 'Driveway'), mon(3, 'Garage'),
    ])),
    http.get('/api/v3/monitors-permissions', () => paged(over.monitorPerms ?? [
      { id: 101, monitor_id: 1, user_id: 7, permission: 'Edit' },
      { id: 102, monitor_id: 1, user_id: 99, permission: 'None' }, // another user — must be ignored
    ])),
    http.get('/api/v3/groups-permissions', () => paged(over.groupPerms ?? [
      { id: 201, group_id: 10, user_id: 7, permission: 'None' },
      { id: 202, group_id: 11, user_id: 7, permission: 'Edit' },
      { id: 203, group_id: 11, user_id: 99, permission: 'None' }, // other user
    ])),
    http.get('/api/v3/groups-monitors', () => paged(over.groupMonitors ?? [
      { id: 1, group_id: 10, monitor_id: 2 },
      { id: 2, group_id: 11, monitor_id: 2 },
    ])),
  );
}

function stubMutations() {
  server.use(
    http.post('/api/v3/monitors-permissions', async ({ request }) => {
      sent.push({ method: 'POST', url: new URL(request.url).pathname, body: await request.json() });
      return HttpResponse.json({ id: 500, monitor_id: 3, user_id: 7, permission: 'View' });
    }),
    http.patch('/api/v3/monitors-permissions/:id', async ({ request, params }) => {
      sent.push({ method: 'PATCH', url: `/api/v3/monitors-permissions/${params.id}`, body: await request.json() });
      return HttpResponse.json({ id: Number(params.id), monitor_id: 1, user_id: 7, permission: 'View' });
    }),
    http.delete('/api/v3/monitors-permissions/:id', ({ params }) => {
      sent.push({ method: 'DELETE', url: `/api/v3/monitors-permissions/${params.id}` });
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

async function mount(user = testUser()) {
  const hook = renderHook(() => useMonitorPermissions(user), { wrapper: wrapper() });
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook;
}

describe('useMonitorPermissions — rows', () => {
  it('builds one row per monitor with the override, and layers monitor > group > global for `effective`', async () => {
    stubAll();
    const { result } = await mount();

    await waitFor(() => expect(result.current.rows).toHaveLength(3));
    expect(result.current.hasMonitors).toBe(true);

    const [front, drive, garage] = result.current.rows;

    // Explicit per-monitor override wins outright.
    expect(front).toMatchObject({
      key: 'monitor-1', label: 'Front Door', sublabel: '#1', value: 'Edit', effective: 'Edit',
    });
    // No monitor row, so the most permissive of groups 10 (None) / 11 (Edit).
    expect(drive).toMatchObject({ key: 'monitor-2', value: 'Inherit', effective: 'Edit' });
    // Nothing anywhere — falls back to the user's global `monitors` level.
    expect(garage).toMatchObject({ key: 'monitor-3', value: 'Inherit', effective: 'View' });

    // Every row offers the four Inherit-capable levels.
    expect(front.options).toEqual(['Inherit', 'None', 'View', 'Edit']);
  });

  it('ignores permission rows belonging to other users', async () => {
    stubAll({
      monitorPerms: [{ id: 102, monitor_id: 1, user_id: 99, permission: 'Edit' }],
      groupPerms: [{ id: 203, group_id: 11, user_id: 99, permission: 'Edit' }],
    });
    const { result } = await mount(testUser({ monitors: 'None' }));

    await waitFor(() => expect(result.current.rows).toHaveLength(3));
    expect(result.current.rows.map((r) => r.value)).toEqual(['Inherit', 'Inherit', 'Inherit']);
    expect(result.current.rows.map((r) => r.effective)).toEqual(['None', 'None', 'None']);
  });

  it('hides soft-deleted monitors and reports the empty state', async () => {
    stubAll({ monitors: [mon(1, 'Front Door', { deleted: 1 })] });
    const { result } = await mount();

    await waitFor(() => expect(result.current.rows).toHaveLength(0));
    expect(result.current.hasMonitors).toBe(false);
  });

  it('falls back to None when the user has no global monitors level at all', async () => {
    stubAll({ monitorPerms: [], groupPerms: [], groupMonitors: [] });
    const { result } = await mount(testUser({ monitors: '' }));

    await waitFor(() => expect(result.current.rows).toHaveLength(3));
    expect(result.current.rows.every((r) => r.effective === 'None')).toBe(true);
  });
});

describe('useMonitorPermissions — setLevel', () => {
  it('POSTs a new row when the monitor has no override yet', async () => {
    stubAll();
    stubMutations();
    const { result } = await mount();
    await waitFor(() => expect(result.current.rows).toHaveLength(3));

    act(() => result.current.setLevel('monitor-3', 'View'));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({
      method: 'POST',
      url: '/api/v3/monitors-permissions',
      body: { monitor_id: 3, user_id: 7, permission: 'View' },
    });
  });

  it('PATCHes the existing row when an override is already there', async () => {
    stubAll();
    stubMutations();
    const { result } = await mount();
    await waitFor(() => expect(result.current.rows).toHaveLength(3));

    act(() => result.current.setLevel('monitor-1', 'View'));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({
      method: 'PATCH',
      url: '/api/v3/monitors-permissions/101',
      body: { permission: 'View' },
    });
  });

  it('DELETEs the row when the level goes back to Inherit', async () => {
    stubAll();
    stubMutations();
    const { result } = await mount();
    await waitFor(() => expect(result.current.rows).toHaveLength(3));

    act(() => result.current.setLevel('monitor-1', 'Inherit'));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ method: 'DELETE', url: '/api/v3/monitors-permissions/101' });
  });

  it('is a no-op request-wise when Inherit is chosen for a monitor that has no row', async () => {
    stubAll();
    stubMutations();
    const { result } = await mount();
    await waitFor(() => expect(result.current.rows).toHaveLength(3));

    act(() => result.current.setLevel('monitor-3', 'Inherit'));

    // Give the mutation a chance to fire before asserting nothing went out.
    await waitFor(() => expect(result.current.rows).toHaveLength(3));
    expect(sent).toEqual([]);
  });

  it('surfaces a failed write as an error toast and leaves the row alone', async () => {
    stubAll();
    server.use(
      http.patch('/api/v3/monitors-permissions/:id', () =>
        HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'permissions table locked' }, { status: 500 })),
    );
    const { result } = await mount();
    await waitFor(() => expect(result.current.rows).toHaveLength(3));

    act(() => result.current.setLevel('monitor-1', 'None'));

    await waitFor(() => expect(useToastStore.getState().toasts).toHaveLength(1));
    const [toast] = useToastStore.getState().toasts;
    expect(toast.tone).toBe('error');
    expect(toast.message).toMatch(/permissions table locked/);
    expect(result.current.rows[0].value).toBe('Edit');
  });
});

describe('useMonitorPermissions — failure paths', () => {
  it('stops loading and shows no rows when the monitor list 500s', async () => {
    stubAll();
    server.use(
      http.get('/api/v3/monitors', () =>
        HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'monitors table locked' }, { status: 500 })),
    );
    const { result } = await mount();

    expect(result.current.rows).toEqual([]);
    expect(result.current.hasMonitors).toBe(false);
  });

  it('survives a network failure on the permissions endpoints', async () => {
    stubAll();
    server.use(
      http.get('/api/v3/monitors-permissions', () => HttpResponse.error()),
      http.get('/api/v3/groups-permissions', () => HttpResponse.error()),
    );
    const { result } = await mount(testUser({ monitors: 'Edit' }));

    // Monitors still loaded, so rows render with global fallback only.
    await waitFor(() => expect(result.current.rows).toHaveLength(3));
    expect(result.current.rows.map((r) => r.effective)).toEqual(['Edit', 'Edit', 'Edit']);
  });

  it('treats a 403 on the permission lists as "no overrides visible"', async () => {
    stubAll();
    server.use(
      http.get('/api/v3/monitors-permissions', () =>
        HttpResponse.json({ kind: 'FORBIDDEN', error_message: 'system Edit required' }, { status: 403 })),
    );
    const { result } = await mount();

    await waitFor(() => expect(result.current.rows).toHaveLength(3));
    expect(result.current.rows.map((r) => r.value)).toEqual(['Inherit', 'Inherit', 'Inherit']);
  });
});

describe('useMonitorPermissions — loading', () => {
  it('reports isLoading until every dependent query settles', async () => {
    stubAll();
    const { result } = renderHook(() => useMonitorPermissions(testUser()), { wrapper: wrapper() });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.rows).toEqual([]);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    vi.clearAllMocks();
  });
});

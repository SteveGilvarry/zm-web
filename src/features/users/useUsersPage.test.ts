/**
 * `useUsersPage` — Settings → Users.
 *
 * The whole list is fetched once so search spans every page; paging and
 * filtering are client-side. The editor target lives in `?uid=` (0 = create),
 * and permissions follow legacy `user.php`: System Edit for everything, or
 * `ZM_USER_SELF_EDIT` letting a user open only their own row.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/components/common/toastStore';
import type { User, UserClaims } from '@/types';

let mockSearch: Record<string, unknown> = {};
const navigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useSearch: () => mockSearch,
  useNavigate: () => navigate,
}));

const { useUsersPage, USERS_PAGE_SIZE } = await import('./useUsersPage');

const paged = (items: unknown[], total = items.length) =>
  HttpResponse.json({ items, total, per_page: 1000, current_page: 1, last_page: 1 });

interface Sent { method: string; url: string; body?: unknown }
let sent: Sent[] = [];

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  sent = [];
  mockSearch = {};
  navigate.mockReset();
  useToastStore.getState().clear();
});
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

const ADMIN_PERMS = {
  stream: 'Edit', events: 'Edit', control: 'Edit', monitors: 'Edit',
  groups: 'Edit', devices: 'Edit', snapshots: 'Edit', system: 'Edit',
} as const;
const VIEWER_PERMS = { ...ADMIN_PERMS, system: 'View' } as const;

function signIn(perms: Record<string, string>, claims: Partial<UserClaims> = {}) {
  useAuthStore.setState({
    accessToken: 't',
    refreshToken: 't',
    isAuthenticated: true,
    user: { iat: 0, exp: 0, user: 'admin', perms, ...claims } as unknown as UserClaims,
  });
}

function wrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

const user = (id: number, username: string, over: Partial<User> = {}): User => ({
  id, username, name: `${username} name`, email: `${username}@example.com`, enabled: 1,
  system: 'None', stream: 'View', events: 'View', control: 'None',
  monitors: 'View', groups: 'None', devices: 'None', snapshots: 'None', ...over,
});

const THREE = [user(1, 'admin'), user(3, 'zoe'), user(2, 'bob', { enabled: 0 })];

function stubUsers(items: User[] = THREE, selfEdit = '0') {
  server.use(
    http.get('/api/v3/users', () => paged(items)),
    http.get('/api/v3/configs/ZM_USER_SELF_EDIT', () =>
      HttpResponse.json({ name: 'ZM_USER_SELF_EDIT', value: selfEdit })),
  );
}

function stubWrites() {
  server.use(
    http.put('/api/v3/users/:id', async ({ request, params }) => {
      sent.push({ method: 'PUT', url: `/api/v3/users/${params.id}`, body: await request.json() });
      return HttpResponse.json({ id: Number(params.id) });
    }),
    http.delete('/api/v3/users/:id', ({ params }) => {
      sent.push({ method: 'DELETE', url: `/api/v3/users/${params.id}` });
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

async function mount() {
  const hook = renderHook(() => useUsersPage(), { wrapper: wrapper() });
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook;
}

describe('useUsersPage — list, search and paging', () => {
  it('sorts by username and reports the totals', async () => {
    signIn(ADMIN_PERMS);
    stubUsers();
    const { result } = await mount();

    await waitFor(() => expect(result.current.filteredUsers).toHaveLength(3));
    expect(result.current.filteredUsers.map((u) => u.username)).toEqual(['admin', 'bob', 'zoe']);
    expect(result.current.total).toBe(3);
    expect(result.current.matchingCount).toBe(3);
    expect(result.current.page).toBe(1);
    expect(result.current.totalPages).toBe(1);
    expect(result.current.isError).toBe(false);
  });

  it('searches across username, name and email', async () => {
    signIn(ADMIN_PERMS);
    stubUsers();
    const { result } = await mount();
    await waitFor(() => expect(result.current.filteredUsers).toHaveLength(3));

    act(() => result.current.setSearchQuery('ZOE'));
    expect(result.current.filteredUsers.map((u) => u.username)).toEqual(['zoe']);

    act(() => result.current.setSearchQuery('bob name'));
    expect(result.current.filteredUsers.map((u) => u.username)).toEqual(['bob']);

    act(() => result.current.setSearchQuery('admin@example.com'));
    expect(result.current.filteredUsers.map((u) => u.username)).toEqual(['admin']);

    act(() => result.current.setSearchQuery('   '));
    expect(result.current.matchingCount).toBe(3);
  });

  it('pages client-side and clamps the page when the filter shrinks the list', async () => {
    signIn(ADMIN_PERMS);
    const many = Array.from({ length: USERS_PAGE_SIZE + 5 }, (_, i) =>
      user(i + 1, `u${String(i + 1).padStart(2, '0')}`));
    stubUsers(many);
    const { result } = await mount();
    await waitFor(() => expect(result.current.totalPages).toBe(2));

    expect(result.current.filteredUsers).toHaveLength(USERS_PAGE_SIZE);

    act(() => result.current.nextPage());
    expect(result.current.page).toBe(2);
    expect(result.current.filteredUsers).toHaveLength(5);

    // nextPage stops at the last page.
    act(() => result.current.nextPage());
    expect(result.current.page).toBe(2);

    act(() => result.current.prevPage());
    expect(result.current.page).toBe(1);
    act(() => result.current.prevPage());
    expect(result.current.page).toBe(1);

    // A search that leaves one page snaps the page back into range.
    act(() => result.current.nextPage());
    act(() => result.current.setSearchQuery('u01'));
    expect(result.current.page).toBe(1);
    expect(result.current.filteredUsers.map((u) => u.username)).toEqual(['u01']);
  });

  it('exports the matching users, not just the current page', async () => {
    signIn(ADMIN_PERMS);
    stubUsers();
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:users');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const { result } = await mount();
    await waitFor(() => expect(result.current.filteredUsers).toHaveLength(3));

    act(() => result.current.exportUsers('csv'));
    act(() => result.current.exportUsers('json'));

    expect(click).toHaveBeenCalledTimes(2);
    expect(createUrl).toHaveBeenCalledTimes(2);
  });
});

describe('useUsersPage — error and permission states', () => {
  it('surfaces isError when the list 500s', async () => {
    signIn(ADMIN_PERMS);
    server.use(
      http.get('/api/v3/users', () =>
        HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'Users table locked' }, { status: 500 })),
      http.get('/api/v3/configs/ZM_USER_SELF_EDIT', () =>
        HttpResponse.json({ name: 'ZM_USER_SELF_EDIT', value: '0' })),
    );
    const { result } = await mount();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(String((result.current.error as Error).message)).toMatch(/Users table locked/);
    expect(result.current.filteredUsers).toEqual([]);
  });

  it('surfaces isError on a network failure', async () => {
    signIn(ADMIN_PERMS);
    server.use(
      http.get('/api/v3/users', () => HttpResponse.error()),
      http.get('/api/v3/configs/ZM_USER_SELF_EDIT', () =>
        HttpResponse.json({ name: 'ZM_USER_SELF_EDIT', value: '0' })),
    );
    const { result } = await mount();

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('refetch re-requests the list', async () => {
    signIn(ADMIN_PERMS);
    let hits = 0;
    server.use(
      http.get('/api/v3/users', () => { hits += 1; return paged(THREE); }),
      http.get('/api/v3/configs/ZM_USER_SELF_EDIT', () =>
        HttpResponse.json({ name: 'ZM_USER_SELF_EDIT', value: '0' })),
    );
    const { result } = await mount();
    await waitFor(() => expect(hits).toBe(1));

    act(() => result.current.refetch());
    await waitFor(() => expect(hits).toBe(2));
  });

  it('a System View user can read but not edit, and self-edit stays off', async () => {
    signIn(VIEWER_PERMS, { user: 'bob' });
    stubUsers();
    const { result } = await mount();
    await waitFor(() => expect(result.current.filteredUsers).toHaveLength(3));

    expect(result.current.canView).toBe(true);
    expect(result.current.canEdit).toBe(false);
    expect(result.current.selfEditEnabled).toBe(false);
    expect(result.current.editorMode).toBe('self');
    expect(result.current.canEditUser(user(2, 'bob'))).toBe(false);
  });

  it('with ZM_USER_SELF_EDIT on, a non-admin may edit only their own row', async () => {
    signIn(VIEWER_PERMS, { user: 'bob' });
    stubUsers(THREE, '1');
    const { result } = await mount();
    await waitFor(() => expect(result.current.selfEditEnabled).toBe(true));

    expect(result.current.canEditUser(user(2, 'bob'))).toBe(true);
    expect(result.current.canEditUser(user(3, 'zoe'))).toBe(false);
    expect(result.current.isCurrentUser({ id: 2, username: 'bob' })).toBe(true);
  });

  it('identifies the current user by uid when the token carries one', async () => {
    signIn(ADMIN_PERMS, { user: 'someone-else', uid: 3 } as Partial<UserClaims>);
    stubUsers();
    const { result } = await mount();
    await waitFor(() => expect(result.current.filteredUsers).toHaveLength(3));

    expect(result.current.isCurrentUser({ id: 3, username: 'zoe' })).toBe(true);
    expect(result.current.isCurrentUser({ id: 1, username: 'admin' })).toBe(false);
  });
});

describe('useUsersPage — editor target in ?uid=', () => {
  it('uid=0 opens the create form for an admin only', async () => {
    signIn(ADMIN_PERMS);
    mockSearch = { uid: 0 };
    stubUsers();
    const { result } = await mount();

    await waitFor(() => expect(result.current.editorOpen).toBe(true));
    expect(result.current.editingUser).toBeNull();
    expect(result.current.editorMode).toBe('admin');
  });

  it('uid=0 stays closed for a System View user', async () => {
    signIn(VIEWER_PERMS);
    mockSearch = { uid: 0 };
    stubUsers();
    const { result } = await mount();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.editorOpen).toBe(false);
  });

  it('uid=<n> edits the row already in the list without a second request', async () => {
    signIn(ADMIN_PERMS);
    mockSearch = { uid: '3' };
    stubUsers();
    const { result } = await mount();

    await waitFor(() => expect(result.current.editingUser?.username).toBe('zoe'));
    expect(result.current.editorOpen).toBe(true);
  });

  it('falls back to GET /users/:id when the row is not in the list', async () => {
    signIn(ADMIN_PERMS);
    mockSearch = { uid: 42 };
    stubUsers();
    server.use(http.get('/api/v3/users/42', () => HttpResponse.json(user(42, 'ghost'))));
    const { result } = await mount();

    await waitFor(() => expect(result.current.editingUser?.username).toBe('ghost'));
    expect(result.current.editorOpen).toBe(true);
  });

  it('ignores a junk uid', async () => {
    signIn(ADMIN_PERMS);
    mockSearch = { uid: 'not-a-number' };
    stubUsers();
    const { result } = await mount();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.editorOpen).toBe(false);
    expect(result.current.editingUser).toBeNull();
    expect(result.current.editorLoading).toBe(false);
  });

  it('round-trips the target through the URL', async () => {
    signIn(ADMIN_PERMS);
    stubUsers();
    const { result } = await mount();
    await waitFor(() => expect(result.current.filteredUsers).toHaveLength(3));

    act(() => result.current.openCreate());
    expect(navigate).toHaveBeenLastCalledWith(expect.objectContaining({ to: '/settings/users', replace: false }));
    // The search updater deletes `uid` on close and sets it otherwise.
    const setCreate = navigate.mock.calls.at(-1)![0].search as (p: Record<string, unknown>) => unknown;
    expect(setCreate({ keep: 1 })).toEqual({ keep: 1, uid: 0 });

    act(() => result.current.openEdit(user(3, 'zoe')));
    const setEdit = navigate.mock.calls.at(-1)![0].search as (p: Record<string, unknown>) => unknown;
    expect(setEdit({})).toEqual({ uid: 3 });

    act(() => result.current.closeEditor());
    expect(navigate).toHaveBeenLastCalledWith(expect.objectContaining({ replace: true }));
    const clear = navigate.mock.calls.at(-1)![0].search as (p: Record<string, unknown>) => unknown;
    expect(clear({ uid: 3, keep: 1 })).toEqual({ keep: 1 });
  });
});

describe('useUsersPage — selection, delete and the enable toggle', () => {
  it('toggles one row and toggles all deletable rows (never the current user)', async () => {
    signIn(ADMIN_PERMS, { user: 'admin' });
    stubUsers();
    const { result } = await mount();
    await waitFor(() => expect(result.current.filteredUsers).toHaveLength(3));

    act(() => result.current.toggleSelected(3));
    expect([...result.current.selectedIds]).toEqual([3]);
    expect(result.current.selectedUsers.map((u) => u.username)).toEqual(['zoe']);

    act(() => result.current.toggleSelected(3));
    expect(result.current.selectedIds.size).toBe(0);

    // "admin" is the signed-in user, so select-all skips it.
    act(() => result.current.toggleAll());
    expect([...result.current.selectedIds].sort()).toEqual([2, 3]);

    act(() => result.current.toggleAll());
    expect(result.current.selectedIds.size).toBe(0);

    act(() => result.current.toggleSelected(2));
    act(() => result.current.clearSelection());
    expect(result.current.selectedIds.size).toBe(0);
  });

  it('stages a delete, refuses to stage the current user, and DELETEs on confirm', async () => {
    signIn(ADMIN_PERMS, { user: 'admin' });
    stubUsers();
    stubWrites();
    const { result } = await mount();
    await waitFor(() => expect(result.current.filteredUsers).toHaveLength(3));

    // The signed-in user is filtered out of the request.
    act(() => result.current.requestDelete(user(1, 'admin')));
    expect(result.current.deleteTargets).toEqual([]);

    act(() => result.current.requestDelete([user(2, 'bob'), user(3, 'zoe'), user(1, 'admin')]));
    expect(result.current.deleteTargets.map((u) => u.username)).toEqual(['bob', 'zoe']);

    act(() => result.current.confirmDelete());

    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent).toEqual([
      { method: 'DELETE', url: '/api/v3/users/2' },
      { method: 'DELETE', url: '/api/v3/users/3' },
    ]);
    await waitFor(() => expect(result.current.deleteTargets).toEqual([]));
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.message).toBe('2 users deleted'));
  });

  it('clearDelete drops the staged targets and confirmDelete with none is a no-op', async () => {
    signIn(ADMIN_PERMS, { user: 'admin' });
    stubUsers();
    stubWrites();
    const { result } = await mount();
    await waitFor(() => expect(result.current.filteredUsers).toHaveLength(3));

    act(() => result.current.confirmDelete());
    expect(sent).toEqual([]);

    act(() => result.current.requestDelete(user(2, 'bob')));
    act(() => result.current.clearDelete());
    expect(result.current.deleteTargets).toEqual([]);
    expect(sent).toEqual([]);
  });

  it('toasts the backend message when a delete fails', async () => {
    signIn(ADMIN_PERMS, { user: 'admin' });
    stubUsers();
    server.use(
      http.delete('/api/v3/users/:id', () =>
        HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'user owns events' }, { status: 500 })),
    );
    const { result } = await mount();
    await waitFor(() => expect(result.current.filteredUsers).toHaveLength(3));

    act(() => result.current.requestDelete(user(2, 'bob')));
    act(() => result.current.confirmDelete());

    await waitFor(() => expect(useToastStore.getState().toasts).toHaveLength(1));
    expect(useToastStore.getState().toasts[0].tone).toBe('error');
    expect(useToastStore.getState().toasts[0].message).toMatch(/user owns events/);
  });

  it('flips `enabled` as a 0/1 int in the PUT body', async () => {
    signIn(ADMIN_PERMS, { user: 'admin' });
    stubUsers();
    stubWrites();
    const { result } = await mount();
    await waitFor(() => expect(result.current.filteredUsers).toHaveLength(3));

    act(() => result.current.toggleEnabled(user(3, 'zoe', { enabled: 1 })));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ method: 'PUT', url: '/api/v3/users/3', body: { enabled: 0 } });

    act(() => result.current.toggleEnabled(user(2, 'bob', { enabled: 0 })));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]).toEqual({ method: 'PUT', url: '/api/v3/users/2', body: { enabled: 1 } });
  });

  it('toasts when the enable toggle is rejected', async () => {
    signIn(ADMIN_PERMS, { user: 'admin' });
    stubUsers();
    server.use(
      http.put('/api/v3/users/:id', () =>
        HttpResponse.json({ kind: 'FORBIDDEN', error_message: 'nope' }, { status: 403 })),
    );
    const { result } = await mount();
    await waitFor(() => expect(result.current.filteredUsers).toHaveLength(3));

    act(() => result.current.toggleEnabled(user(3, 'zoe')));

    await waitFor(() => expect(useToastStore.getState().toasts).toHaveLength(1));
    expect(useToastStore.getState().toasts[0].tone).toBe('error');
  });
});

describe('useUsersPage — signed out', () => {
  it('does not query at all', async () => {
    useAuthStore.getState().clearAuth();
    const { result } = renderHook(() => useUsersPage(), { wrapper: wrapper() });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.users).toEqual([]);
    expect(result.current.total).toBe(0);
  });
});

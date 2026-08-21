/**
 * Run-state management: the saved `States` presets, the three daemon
 * supervisor actions, and the guards the legacy `?view=state` modal had
 * (reserved names, duplicate names, the protected `default` row).
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type FormEvent, type ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/components/common/toastStore';
import { isProtectedState, useRunStatePage } from './useRunStatePage';

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', user: null, isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  server.resetHandlers();
  useToastStore.getState().clear();
  requests.length = 0;
});
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

/** Every mutating request, for asserting method / URL / body. */
const requests: Array<{ method: string; url: string; body: unknown }> = [];

const STATES = [
  { id: 1, name: 'default', definition: '1:Always:Always:OnMotion,2:Always:None:None', is_active: 1 },
  { id: 2, name: 'Night', definition: '1:Always:Always:Always', is_active: 0 },
  // Reserved synthetic rows the legacy modal invented — never listed.
  { id: 3, name: 'start', definition: '', is_active: 0 },
  { id: 4, name: 'Stop', definition: '', is_active: 0 },
  { id: 5, name: 'restart', definition: '', is_active: 0 },
];

const MONITORS = [
  { id: 2, name: 'Driveway', capturing: 'Always', analysing: 'None', recording: 'None' },
  { id: 1, name: 'Front Door', capturing: 'Always', analysing: 'Always', recording: 'OnMotion' },
];

const paged = (items: unknown[]) =>
  HttpResponse.json({ items, total: items.length, per_page: 200, current_page: 1, last_page: 1 });

function stubAll(states: unknown[] = STATES, monitors: unknown[] = MONITORS) {
  server.use(
    http.get('/api/v3/states', () => paged(states)),
    http.get('/api/v3/monitors', () => paged(monitors)),
    http.post('/api/v3/states', async ({ request }) => {
      const body = await request.json();
      requests.push({ method: 'POST', url: '/api/v3/states', body });
      return HttpResponse.json({ id: 9, ...(body as object) });
    }),
    http.patch('/api/v3/states/:id', async ({ params, request }) => {
      const body = await request.json();
      requests.push({ method: 'PATCH', url: `/api/v3/states/${params.id}`, body });
      return HttpResponse.json({ id: Number(params.id), ...(body as object) });
    }),
    http.delete('/api/v3/states/:id', ({ params }) => {
      requests.push({ method: 'DELETE', url: `/api/v3/states/${params.id}`, body: null });
      return new HttpResponse(null, { status: 204 });
    }),
    http.post('/api/v3/system/state', async ({ request }) => {
      const body = await request.json();
      requests.push({ method: 'POST', url: '/api/v3/system/state', body });
      return HttpResponse.json({ success: true, message: 'applied' });
    }),
    http.post('/api/v3/states/change/:action', ({ params }) => {
      requests.push({ method: 'POST', url: `/api/v3/states/change/${params.action}`, body: null });
      return HttpResponse.json({ message: `daemons ${params.action}ed` });
    }),
  );
}

function mount() {
  return renderHook(() => useRunStatePage(), { wrapper: makeWrapper() });
}

/** A synthetic submit event for `handleSaveCurrent`. */
const submitEvent = () => ({ preventDefault: vi.fn() }) as unknown as FormEvent;

const toastMessages = () => useToastStore.getState().toasts.map((t) => t.message);

describe('isProtectedState', () => {
  it('protects the seeded `default` row, case-insensitively', () => {
    expect(isProtectedState('default')).toBe(true);
    expect(isProtectedState('DEFAULT')).toBe(true);
    expect(isProtectedState('Night')).toBe(false);
  });
});

describe('useRunStatePage — the list', () => {
  it('lists saved states, hiding the reserved start/stop/restart rows', async () => {
    stubAll();
    const { result } = mount();
    await waitFor(() => expect(result.current.states).toHaveLength(2));
    expect(result.current.states.map((s) => s.name)).toEqual(['default', 'Night']);
    expect(result.current.monitors).toHaveLength(2);
    expect(result.current.busy).toBe(false);
  });

  it('is empty when the backend has no states', async () => {
    stubAll([]);
    const { result } = mount();
    await waitFor(() => expect(result.current.statesLoading).toBe(false));
    expect(result.current.states).toEqual([]);
  });

  it('surfaces a 500 as statesIsError and refetches on demand', async () => {
    let hits = 0;
    server.use(
      http.get('/api/v3/states', () => {
        hits += 1;
        return HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'States table locked' }, { status: 500 });
      }),
      http.get('/api/v3/monitors', () => paged(MONITORS)),
    );
    const { result } = mount();

    await waitFor(() => expect(result.current.statesIsError).toBe(true));
    expect(result.current.statesError).toBeInstanceOf(Error);
    expect(result.current.statesRawError).toBeTruthy();
    expect(result.current.states).toEqual([]);

    act(() => result.current.refetchStates());
    await waitFor(() => expect(hits).toBeGreaterThan(1));
  });

  it('surfaces a network failure the same way', async () => {
    server.use(
      http.get('/api/v3/states', () => HttpResponse.error()),
      http.get('/api/v3/monitors', () => paged(MONITORS)),
    );
    const { result } = mount();
    await waitFor(() => expect(result.current.statesIsError).toBe(true));
    expect(result.current.states).toEqual([]);
  });

  it('queries nothing while signed out', () => {
    useAuthStore.setState({ isAuthenticated: false });
    try {
      const { result } = mount();     // no handlers: a request would fail the run
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.states).toEqual([]);
    } finally {
      useAuthStore.setState({ isAuthenticated: true });
    }
  });
});

describe('useRunStatePage — definition preview', () => {
  it('resolves each triple to the monitor that owns it', async () => {
    stubAll();
    const { result } = mount();
    await waitFor(() => expect(result.current.monitors).toHaveLength(2));

    const rows = result.current.definitionRows(result.current.states[0]);
    expect(rows).toEqual([
      { id: 1, name: 'Front Door', known: true, capturing: 'Always', analysing: 'Always', recording: 'OnMotion' },
      { id: 2, name: 'Driveway', known: true, capturing: 'Always', analysing: 'None', recording: 'None' },
    ]);
  });

  it('labels a monitor the definition names but the fleet no longer has', async () => {
    stubAll([{ id: 7, name: 'Stale', definition: '99:Always:Always:Always', is_active: 0 }]);
    const { result } = mount();
    await waitFor(() => expect(result.current.states).toHaveLength(1));

    const rows = result.current.definitionRows(result.current.states[0]);
    expect(rows).toEqual([
      { id: 99, name: 'Monitor 99', known: false, capturing: 'Always', analysing: 'Always', recording: 'Always' },
    ]);
  });

  it('toggles the preview open and closed', async () => {
    stubAll();
    const { result } = mount();
    await waitFor(() => expect(result.current.states).toHaveLength(2));

    expect(result.current.previewId).toBeNull();
    act(() => result.current.togglePreview(2));
    expect(result.current.previewId).toBe(2);
    act(() => result.current.togglePreview(1));
    expect(result.current.previewId).toBe(1);
    act(() => result.current.togglePreview(1));
    expect(result.current.previewId).toBeNull();
  });
});

describe('useRunStatePage — apply / delete / daemon actions', () => {
  it('apply posts the state name to /system/state and toasts', async () => {
    stubAll();
    const { result } = mount();
    await waitFor(() => expect(result.current.states).toHaveLength(2));

    act(() => result.current.setApplyTarget(result.current.states[1]));
    expect(result.current.applyTarget?.name).toBe('Night');

    act(() => result.current.confirmApply());
    await waitFor(() => expect(requests).toContainEqual({
      method: 'POST', url: '/api/v3/system/state', body: { state_name: 'Night' },
    }));
    expect(result.current.applyTarget).toBeNull();
    await waitFor(() => expect(toastMessages()).toContain('State "Night" applied'));
  });

  it('confirmApply is inert with nothing targeted', async () => {
    stubAll();
    const { result } = mount();
    await waitFor(() => expect(result.current.states).toHaveLength(2));
    act(() => result.current.confirmApply());
    expect(requests).toHaveLength(0);
  });

  it('delete DELETEs the row by id and toasts', async () => {
    stubAll();
    const { result } = mount();
    await waitFor(() => expect(result.current.states).toHaveLength(2));

    act(() => result.current.setDeleteTarget(result.current.states[1]));
    act(() => result.current.confirmDelete());

    await waitFor(() => expect(requests).toContainEqual({
      method: 'DELETE', url: '/api/v3/states/2', body: null,
    }));
    expect(result.current.deleteTarget).toBeNull();
    await waitFor(() => expect(toastMessages()).toContain('State deleted'));
  });

  it('confirmDelete is inert with nothing targeted', async () => {
    stubAll();
    const { result } = mount();
    await waitFor(() => expect(result.current.states).toHaveLength(2));
    act(() => result.current.confirmDelete());
    expect(requests).toHaveLength(0);
  });

  it('a daemon action posts to /states/change/<action> and reports its message', async () => {
    stubAll();
    const { result } = mount();
    await waitFor(() => expect(result.current.states).toHaveLength(2));

    act(() => result.current.setDaemonTarget('restart'));
    expect(result.current.daemonTarget).toBe('restart');

    act(() => result.current.confirmDaemon());
    await waitFor(() => expect(requests).toContainEqual({
      method: 'POST', url: '/api/v3/states/change/restart', body: null,
    }));
    expect(result.current.daemonTarget).toBeNull();
    await waitFor(() => expect(result.current.daemonSuccess).toBe(true));
    expect(result.current.daemonMessage).toBe('daemons restarted');
    expect(result.current.daemonError).toBeNull();
  });

  it('confirmDaemon is inert with nothing targeted', async () => {
    stubAll();
    const { result } = mount();
    await waitFor(() => expect(result.current.states).toHaveLength(2));
    act(() => result.current.confirmDaemon());
    expect(requests).toHaveLength(0);
  });

  it('reports a failed daemon action instead of swallowing it', async () => {
    stubAll();
    server.use(
      http.post('/api/v3/states/change/:action', () =>
        HttpResponse.json({ kind: 'INTERNAL', error_message: 'zmpkg.pl not found' }, { status: 500 }),
      ),
    );
    const { result } = mount();
    await waitFor(() => expect(result.current.states).toHaveLength(2));

    act(() => result.current.setDaemonTarget('stop'));
    act(() => result.current.confirmDaemon());

    await waitFor(() => expect(result.current.daemonError).toBeInstanceOf(Error));
    expect(result.current.daemonSuccess).toBe(false);
    await waitFor(() => expect(toastMessages().length).toBeGreaterThan(0));
  });

  it('reports a failed apply', async () => {
    stubAll();
    server.use(
      http.post('/api/v3/system/state', () =>
        HttpResponse.json({ kind: 'INTERNAL', error_message: 'no such state' }, { status: 500 }),
      ),
    );
    const { result } = mount();
    await waitFor(() => expect(result.current.states).toHaveLength(2));

    act(() => result.current.setApplyTarget(result.current.states[1]));
    act(() => result.current.confirmApply());
    await waitFor(() => expect(toastMessages().length).toBeGreaterThan(0));
    expect(toastMessages().join(' ')).not.toContain('applied');
  });
});

describe('useRunStatePage — save current fleet as a state', () => {
  it('posts the composed definition sorted by monitor id and clears the name', async () => {
    stubAll();
    const { result } = mount();
    await waitFor(() => expect(result.current.monitors).toHaveLength(2));

    act(() => result.current.setNewStateName('  Evening  '));
    expect(result.current.newStateName).toBe('  Evening  ');

    const e = submitEvent();
    await act(async () => { result.current.handleSaveCurrent(e); });
    expect(e.preventDefault).toHaveBeenCalled();

    await waitFor(() => expect(requests).toContainEqual({
      method: 'POST',
      url: '/api/v3/states',
      body: {
        name: 'Evening',
        definition: '1:Always:Always:OnMotion,2:Always:None:None',
        is_active: 0,
      },
    }));
    await waitFor(() => expect(result.current.newStateName).toBe(''));
    await waitFor(() => expect(toastMessages()).toContain('State "Evening" saved'));
  });

  it('does nothing on an empty or whitespace-only name', async () => {
    stubAll();
    const { result } = mount();
    await waitFor(() => expect(result.current.monitors).toHaveLength(2));

    await act(async () => { result.current.handleSaveCurrent(submitEvent()); });
    act(() => result.current.setNewStateName('   '));
    await act(async () => { result.current.handleSaveCurrent(submitEvent()); });

    expect(requests).toHaveLength(0);
    expect(toastMessages()).toEqual([]);
  });

  it('refuses the reserved daemon names', async () => {
    stubAll();
    const { result } = mount();
    await waitFor(() => expect(result.current.monitors).toHaveLength(2));

    act(() => result.current.setNewStateName('Restart'));
    await act(async () => { result.current.handleSaveCurrent(submitEvent()); });

    expect(requests).toHaveLength(0);
    expect(toastMessages()).toContain('"Restart" is a reserved name. Choose another.');
  });

  it('refuses a name that already exists, ignoring case', async () => {
    stubAll();
    const { result } = mount();
    await waitFor(() => expect(result.current.states).toHaveLength(2));

    act(() => result.current.setNewStateName('night'));
    await act(async () => { result.current.handleSaveCurrent(submitEvent()); });

    expect(requests).toHaveLength(0);
    expect(toastMessages()).toContain('A state named "night" already exists.');
  });

  it('reports a failed save', async () => {
    stubAll();
    server.use(
      http.post('/api/v3/states', () =>
        HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'duplicate key' }, { status: 500 }),
      ),
    );
    const { result } = mount();
    await waitFor(() => expect(result.current.monitors).toHaveLength(2));

    act(() => result.current.setNewStateName('Evening'));
    await act(async () => { result.current.handleSaveCurrent(submitEvent()); });

    await waitFor(() => expect(result.current.saveError).toBeInstanceOf(Error));
    // The name survives so the operator can retry.
    expect(result.current.newStateName).toBe('Evening');
  });
});

describe('useRunStatePage — rename', () => {
  it('PATCHes the new name and closes the editor', async () => {
    stubAll();
    const { result } = mount();
    await waitFor(() => expect(result.current.states).toHaveLength(2));

    act(() => result.current.startRename(result.current.states[1]));
    expect(result.current.renameTarget?.id).toBe(2);
    expect(result.current.renameValue).toBe('Night');

    act(() => result.current.setRenameValue('  Nocturne  '));
    act(() => result.current.commitRename());

    await waitFor(() => expect(requests).toContainEqual({
      method: 'PATCH', url: '/api/v3/states/2', body: { name: 'Nocturne' },
    }));
    await waitFor(() => expect(result.current.renameTarget).toBeNull());
    expect(toastMessages()).toContain('State renamed to "Nocturne"');
  });

  it('cancelRename drops the edit without a request', async () => {
    stubAll();
    const { result } = mount();
    await waitFor(() => expect(result.current.states).toHaveLength(2));

    act(() => result.current.startRename(result.current.states[1]));
    act(() => result.current.cancelRename());
    expect(result.current.renameTarget).toBeNull();
    expect(requests).toHaveLength(0);
  });

  it('closes silently when the name is unchanged or blanked', async () => {
    stubAll();
    const { result } = mount();
    await waitFor(() => expect(result.current.states).toHaveLength(2));

    act(() => result.current.startRename(result.current.states[1]));
    act(() => result.current.commitRename());          // unchanged
    expect(result.current.renameTarget).toBeNull();

    act(() => result.current.startRename(result.current.states[1]));
    act(() => result.current.setRenameValue('   '));
    act(() => result.current.commitRename());          // blank
    expect(result.current.renameTarget).toBeNull();

    expect(requests).toHaveLength(0);
  });

  it('refuses to rename onto a reserved daemon name and keeps the editor open', async () => {
    stubAll();
    const { result } = mount();
    await waitFor(() => expect(result.current.states).toHaveLength(2));

    act(() => result.current.startRename(result.current.states[1]));
    act(() => result.current.setRenameValue('stop'));
    act(() => result.current.commitRename());

    expect(requests).toHaveLength(0);
    expect(result.current.renameTarget?.id).toBe(2);
    expect(toastMessages()).toContain('"stop" is a reserved name. Choose another.');
  });

  it('commitRename is inert with no target', async () => {
    stubAll();
    const { result } = mount();
    await waitFor(() => expect(result.current.states).toHaveLength(2));
    act(() => result.current.commitRename());
    expect(requests).toHaveLength(0);
  });

  it('reports a failed rename', async () => {
    stubAll();
    server.use(
      http.patch('/api/v3/states/:id', () =>
        HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'duplicate key' }, { status: 500 }),
      ),
    );
    const { result } = mount();
    await waitFor(() => expect(result.current.states).toHaveLength(2));

    act(() => result.current.startRename(result.current.states[1]));
    act(() => result.current.setRenameValue('default'));
    act(() => result.current.commitRename());

    await waitFor(() => expect(toastMessages().length).toBeGreaterThan(0));
    // Still open, so the operator can fix it.
    expect(result.current.renameTarget?.id).toBe(2);
  });
});

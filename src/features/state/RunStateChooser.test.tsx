/**
 * The legacy `?view=state` modal behind the header RUNNING badge: pick a
 * daemon action or a saved state, Apply, confirm, and only then does anything
 * reach the backend. Covers `RunStateChooser` and `useRunStateChooser`.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import { RunStateChooser } from './RunStateChooser';
import { isDaemonAction, isDeletableState, useRunStateChooser } from './useRunStateChooser';

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', user: null, isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => { server.resetHandlers(); requests.length = 0; });
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

const requests: Array<{ method: string; url: string; body: unknown }> = [];

const STATES = [
  { id: 1, name: 'default', definition: '1:Always:Always:OnMotion', is_active: 1 },
  { id: 2, name: 'Night', definition: '1:Always:Always:Always', is_active: 0 },
  // A saved row that collides with a daemon verb is filtered out of the list.
  { id: 3, name: 'Restart', definition: '', is_active: 0 },
];

/** Save snapshots every monitor's modes, so the hook loads the list too. */
const MONITORS = [
  { id: 2, name: 'Back', capturing: 'Always', analysing: 'Always', recording: 'OnMotion' },
  { id: 1, name: 'Front', capturing: 'Always', analysing: 'None', recording: 'Always' },
];

function stubStates(items: unknown[] = STATES) {
  server.use(
    http.get('/api/v3/states', () =>
      HttpResponse.json({ items, total: items.length, per_page: 200, current_page: 1, last_page: 1 }),
    ),
    http.get('/api/v3/monitors', () =>
      HttpResponse.json({
        items: MONITORS, total: MONITORS.length, per_page: 1000, current_page: 1, last_page: 1,
      }),
    ),
    http.post('/api/v3/states', async ({ request }) => {
      requests.push({ method: 'POST', url: '/api/v3/states', body: await request.json() });
      return HttpResponse.json({ id: 9, name: 'x', definition: '', is_active: 0 }, { status: 201 });
    }),
    http.patch('/api/v3/states/:id', async ({ request, params }) => {
      requests.push({ method: 'PATCH', url: `/api/v3/states/${params.id}`, body: await request.json() });
      return HttpResponse.json({ id: Number(params.id), name: 'x', definition: '', is_active: 0 });
    }),
    http.delete('/api/v3/states/:id', ({ params }) => {
      requests.push({ method: 'DELETE', url: `/api/v3/states/${params.id}`, body: null });
      return new HttpResponse(null, { status: 204 });
    }),
    http.post('/api/v3/system/state', async ({ request }) => {
      requests.push({ method: 'POST', url: '/api/v3/system/state', body: await request.json() });
      return HttpResponse.json({ success: true, message: 'applied' });
    }),
    http.post('/api/v3/server/control/:action', ({ params }) => {
      requests.push({ method: 'POST', url: `/api/v3/server/control/${params.action}`, body: null });
      return HttpResponse.json({ message: 'ok' });
    }),
  );
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

function renderChooser(over: Partial<Parameters<typeof RunStateChooser>[0]> = {}) {
  const onClose = vi.fn();
  const utils = renderWithProviders(
    <RunStateChooser isOpen onClose={onClose} running={true} {...over} />,
  );
  return { ...utils, onClose };
}

/** The confirm step lives in its own dialog; find it by its heading. */
const confirmDialog = (title: string) =>
  screen.getByRole('dialog', { name: title });

describe('isDaemonAction', () => {
  it('recognises the three supervisor verbs, case-insensitively', () => {
    expect(isDaemonAction('start')).toBe(true);
    expect(isDaemonAction('Stop')).toBe(true);
    expect(isDaemonAction('RESTART')).toBe(true);
    expect(isDaemonAction('Night')).toBe(false);
    expect(isDaemonAction('')).toBe(false);
  });
});

describe('useRunStateChooser', () => {
  it('does not query while closed', () => {
    // No handlers registered: any request would fail the run.
    const { result } = renderHook(() => useRunStateChooser(false), { wrapper: makeWrapper() });
    expect(result.current.states).toEqual([]);
    expect(result.current.choice).toBe('');
  });

  it('lists saved states once open, minus any that shadow a daemon verb', async () => {
    stubStates();
    const { result } = renderHook(() => useRunStateChooser(true), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.states).toHaveLength(2));
    expect(result.current.states.map((s) => s.name)).toEqual(['default', 'Night']);
  });

  it('requestApply does nothing until something is chosen', async () => {
    stubStates();
    const { result } = renderHook(() => useRunStateChooser(true), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.states).toHaveLength(2));

    result.current.requestApply();
    await waitFor(() => expect(result.current.confirming).toBeNull());

    result.current.confirmApply();
    expect(requests).toHaveLength(0);
  });

  it('reset clears the choice, the confirm step and any error', async () => {
    stubStates();
    const { result } = renderHook(() => useRunStateChooser(true), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.states).toHaveLength(2));

    await waitFor(() => { result.current.setChoice('Night'); });
    await waitFor(() => expect(result.current.choice).toBe('Night'));
    await waitFor(() => { result.current.requestApply(); });
    await waitFor(() => expect(result.current.confirming).toBe('apply'));

    await waitFor(() => { result.current.reset(); });
    await waitFor(() => expect(result.current.choice).toBe(''));
    expect(result.current.confirming).toBeNull();
    expect(result.current.error).toBeNull();
  });
});

describe('RunStateChooser — the modal', () => {
  it('offers the three daemon verbs plus every saved state', async () => {
    stubStates();
    renderChooser();

    const select = screen.getByLabelText('Change State');
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Night' })).toBeInTheDocument());

    expect(within(select).getByRole('option', { name: 'Start' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'Stop' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'Restart' })).toBeInTheDocument();
    // The active row is marked.
    expect(within(select).getByRole('option', { name: 'default (active)' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'Choose…' })).toBeInTheDocument();
  });

  it('tells the operator when ZoneMinder is already stopped', async () => {
    stubStates();
    renderChooser({ running: false });
    expect(await screen.findByText(/ZoneMinder is stopped/)).toBeInTheDocument();
  });

  it('shows the everyday copy when it is running', async () => {
    stubStates();
    renderChooser({ running: true });
    expect(await screen.findByText(/Change the run state/)).toBeInTheDocument();
  });

  it('disables Apply until a choice is made', async () => {
    stubStates();
    renderChooser();
    const apply = screen.getByRole('button', { name: 'Apply' });
    expect(apply).toBeDisabled();

    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByRole('option', { name: 'Night' })).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('Change State'), 'Night');
    expect(apply).toBeEnabled();
  });

  it('omits the saved-states group entirely when there are none', async () => {
    stubStates([]);
    renderChooser();
    await waitFor(() => expect(screen.queryByText('Loading states…')).toBeNull());
    expect(screen.queryByRole('option', { name: 'Night' })).toBeNull();
    expect(screen.getByRole('option', { name: 'Start' })).toBeInTheDocument();
  });

  it('shows a loading note while the states are in flight', () => {
    stubStates();
    server.use(http.get('/api/v3/states', () => new Promise(() => {})));
    renderChooser();
    expect(screen.getByText('Loading states…')).toBeInTheDocument();
  });
});

describe('RunStateChooser — apply a saved state', () => {
  it('confirms first, then POSTs the state name and closes', async () => {
    const user = userEvent.setup();
    stubStates();
    const { onClose } = renderChooser();

    await waitFor(() => expect(screen.getByRole('option', { name: 'Night' })).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('Change State'), 'Night');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    // Nothing has gone out yet — the confirm step stands between.
    expect(requests).toHaveLength(0);
    const dialog = confirmDialog('Apply run state');
    expect(within(dialog).getByText(/Apply state "Night"\?/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(requests).toEqual([
      { method: 'POST', url: '/api/v3/system/state', body: { state_name: 'Night' } },
    ]));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('Cancel on the confirm step drops back without a request', async () => {
    const user = userEvent.setup();
    stubStates();
    renderChooser();

    await waitFor(() => expect(screen.getByRole('option', { name: 'Night' })).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('Change State'), 'Night');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    const dialog = confirmDialog('Apply run state');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(requests).toHaveLength(0);
    await waitFor(() => expect(screen.getByLabelText('Change State')).toBeInTheDocument());
  });

  it('Cancel on the chooser closes it without a request', async () => {
    const user = userEvent.setup();
    stubStates();
    const { onClose } = renderChooser();

    await waitFor(() => expect(screen.getByRole('option', { name: 'Night' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(requests).toHaveLength(0);
    expect(onClose).toHaveBeenCalled();
  });
});

describe('RunStateChooser — daemon actions', () => {
  it.each([
    ['stop', 'Stop ZoneMinder', /Recording will halt/],
    ['restart', 'Restart ZoneMinder', /Capture streams will reconnect/],
    ['start', 'Start ZoneMinder', /Capture and analysis daemons will launch/],
  ])('%s confirms with its own copy and POSTs /server/control/%s', async (action, title, copy) => {
    const user = userEvent.setup();
    stubStates();
    renderChooser();

    await waitFor(() => expect(screen.getByRole('option', { name: 'Night' })).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('Change State'), action);
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    const dialog = confirmDialog(title);
    expect(within(dialog).getByText(copy)).toBeInTheDocument();
    // The confirm button carries the verb, not a generic "Apply".
    const verb = action[0].toUpperCase() + action.slice(1);
    await user.click(within(dialog).getByRole('button', { name: verb }));

    await waitFor(() => expect(requests).toEqual([
      { method: 'POST', url: `/api/v3/server/control/${action}`, body: null },
    ]));
  });
});

describe('RunStateChooser — failures', () => {
  it('shows the backend error inline and stays open', async () => {
    const user = userEvent.setup();
    stubStates();
    server.use(
      http.post('/api/v3/system/state', () =>
        HttpResponse.json({ kind: 'INTERNAL', error_message: 'zmpkg.pl exited 1' }, { status: 500 }),
      ),
    );
    const { onClose } = renderChooser();

    await waitFor(() => expect(screen.getByRole('option', { name: 'Night' })).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('Change State'), 'Night');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await user.click(within(confirmDialog('Apply run state')).getByRole('button', { name: 'Apply' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Failed:/);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('surfaces a network failure the same way', async () => {
    const user = userEvent.setup();
    stubStates();
    server.use(http.post('/api/v3/server/control/:action', () => HttpResponse.error()));
    renderChooser();

    await waitFor(() => expect(screen.getByRole('option', { name: 'Night' })).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('Change State'), 'stop');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await user.click(within(confirmDialog('Stop ZoneMinder')).getByRole('button', { name: 'Stop' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Failed:/);
  });

  it('renders nothing at all while closed', () => {
    stubStates();
    renderChooser({ isOpen: false });
    expect(screen.queryByLabelText('Change State')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

const DEFINITION = '1:Always:None:Always,2:Always:Always:OnMotion';

describe('RunStateChooser — save a state', () => {
  it('disables Save until there is a name to save under', async () => {
    stubStates();
    renderChooser();
    await waitFor(() => expect(screen.getByRole('option', { name: 'Night' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('POSTs a new state holding every monitor\'s current modes', async () => {
    const user = userEvent.setup();
    stubStates();
    renderChooser();

    await waitFor(() => expect(screen.getByRole('option', { name: 'Night' })).toBeInTheDocument());
    await user.type(screen.getByLabelText('New State'), 'Evening');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(requests).toEqual([
      {
        method: 'POST',
        url: '/api/v3/states',
        body: { name: 'Evening', definition: DEFINITION, is_active: 0 },
      },
    ]));
    // Legacy leaves the modal up after Save; a note confirms it landed.
    expect(await screen.findByRole('status')).toHaveTextContent('State saved.');
    expect(screen.getByLabelText('Change State')).toBeInTheDocument();
  });

  it('PATCHes instead when the name already exists (legacy REPLACE INTO)', async () => {
    const user = userEvent.setup();
    stubStates();
    renderChooser();

    await waitFor(() => expect(screen.getByRole('option', { name: 'Night' })).toBeInTheDocument());
    await user.type(screen.getByLabelText('New State'), 'Night');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(requests).toEqual([
      { method: 'PATCH', url: '/api/v3/states/2', body: { definition: DEFINITION } },
    ]));
  });

  it('falls back to the selected state name when the box is empty', async () => {
    const user = userEvent.setup();
    stubStates();
    renderChooser();

    await waitFor(() => expect(screen.getByRole('option', { name: 'Night' })).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('Change State'), 'Night');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(requests).toEqual([
      { method: 'PATCH', url: '/api/v3/states/2', body: { definition: DEFINITION } },
    ]));
  });

  it('never turns a daemon verb into a state name', async () => {
    const user = userEvent.setup();
    stubStates();
    renderChooser();

    await waitFor(() => expect(screen.getByRole('option', { name: 'Night' })).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('Change State'), 'stop');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('shows the backend error when the save fails', async () => {
    const user = userEvent.setup();
    stubStates();
    server.use(
      http.post('/api/v3/states', () =>
        HttpResponse.json({ kind: 'CONFLICT', error_message: 'duplicate' }, { status: 409 }),
      ),
    );
    renderChooser();

    await waitFor(() => expect(screen.getByRole('option', { name: 'Night' })).toBeInTheDocument());
    await user.type(screen.getByLabelText('New State'), 'Evening');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Failed:/);
  });
});

describe('RunStateChooser — delete a state', () => {
  it('leaves Delete disabled for daemon verbs, "default" and no choice', async () => {
    const user = userEvent.setup();
    stubStates();
    renderChooser();

    await waitFor(() => expect(screen.getByRole('option', { name: 'Night' })).toBeInTheDocument());
    const del = screen.getByRole('button', { name: 'Delete' });
    expect(del).toBeDisabled();

    await user.selectOptions(screen.getByLabelText('Change State'), 'default');
    expect(del).toBeDisabled();

    await user.selectOptions(screen.getByLabelText('Change State'), 'stop');
    expect(del).toBeDisabled();

    await user.selectOptions(screen.getByLabelText('Change State'), 'Night');
    expect(del).toBeEnabled();
  });

  it('confirms first, then DELETEs the row and clears the choice', async () => {
    const user = userEvent.setup();
    stubStates();
    const { onClose } = renderChooser();

    await waitFor(() => expect(screen.getByRole('option', { name: 'Night' })).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('Change State'), 'Night');
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(requests).toHaveLength(0);
    const dialog = confirmDialog('Delete run state');
    expect(within(dialog).getByText(/Delete the saved state "Night"\?/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(requests).toEqual([
      { method: 'DELETE', url: '/api/v3/states/2', body: null },
    ]));
    // Deleting is not applying: the modal stays open and nothing closed it.
    await waitFor(() => expect(screen.getByLabelText('Change State')).toHaveValue(''));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Cancel on the delete confirm drops back without a request', async () => {
    const user = userEvent.setup();
    stubStates();
    renderChooser();

    await waitFor(() => expect(screen.getByRole('option', { name: 'Night' })).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('Change State'), 'Night');
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(within(confirmDialog('Delete run state')).getByRole('button', { name: 'Cancel' }));

    expect(requests).toHaveLength(0);
    await waitFor(() => expect(screen.getByLabelText('Change State')).toBeInTheDocument());
  });

  it('surfaces a delete failure inline', async () => {
    const user = userEvent.setup();
    stubStates();
    server.use(
      http.delete('/api/v3/states/:id', () =>
        HttpResponse.json({ kind: 'INTERNAL', error_message: 'in use' }, { status: 500 }),
      ),
    );
    renderChooser();

    await waitFor(() => expect(screen.getByRole('option', { name: 'Night' })).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('Change State'), 'Night');
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(within(confirmDialog('Delete run state')).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Failed:/);
  });
});

describe('isDeletableState', () => {
  it('is false for nothing, daemon verbs and the built-in default', () => {
    expect(isDeletableState('')).toBe(false);
    expect(isDeletableState('stop')).toBe(false);
    expect(isDeletableState('Restart')).toBe(false);
    expect(isDeletableState('default')).toBe(false);
    expect(isDeletableState('Default')).toBe(false);
    expect(isDeletableState('Night')).toBe(true);
  });
});

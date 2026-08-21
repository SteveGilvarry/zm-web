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
import { isDaemonAction, useRunStateChooser } from './useRunStateChooser';

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

function stubStates(items: unknown[] = STATES) {
  server.use(
    http.get('/api/v3/states', () =>
      HttpResponse.json({ items, total: items.length, per_page: 200, current_page: 1, last_page: 1 }),
    ),
    http.post('/api/v3/system/state', async ({ request }) => {
      requests.push({ method: 'POST', url: '/api/v3/system/state', body: await request.json() });
      return HttpResponse.json({ success: true, message: 'applied' });
    }),
    http.post('/api/v3/states/change/:action', ({ params }) => {
      requests.push({ method: 'POST', url: `/api/v3/states/change/${params.action}`, body: null });
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
    await waitFor(() => expect(result.current.confirming).toBe(false));

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
    await waitFor(() => expect(result.current.confirming).toBe(true));

    await waitFor(() => { result.current.reset(); });
    await waitFor(() => expect(result.current.choice).toBe(''));
    expect(result.current.confirming).toBe(false);
    expect(result.current.error).toBeNull();
  });
});

describe('RunStateChooser — the modal', () => {
  it('offers the three daemon verbs plus every saved state', async () => {
    stubStates();
    renderChooser();

    const select = screen.getByLabelText('New state');
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
    await user.selectOptions(screen.getByLabelText('New state'), 'Night');
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
    await user.selectOptions(screen.getByLabelText('New state'), 'Night');
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
    await user.selectOptions(screen.getByLabelText('New state'), 'Night');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    const dialog = confirmDialog('Apply run state');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(requests).toHaveLength(0);
    await waitFor(() => expect(screen.getByLabelText('New state')).toBeInTheDocument());
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
  ])('%s confirms with its own copy and POSTs /states/change/%s', async (action, title, copy) => {
    const user = userEvent.setup();
    stubStates();
    renderChooser();

    await waitFor(() => expect(screen.getByRole('option', { name: 'Night' })).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('New state'), action);
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    const dialog = confirmDialog(title);
    expect(within(dialog).getByText(copy)).toBeInTheDocument();
    // The confirm button carries the verb, not a generic "Apply".
    const verb = action[0].toUpperCase() + action.slice(1);
    await user.click(within(dialog).getByRole('button', { name: verb }));

    await waitFor(() => expect(requests).toEqual([
      { method: 'POST', url: `/api/v3/states/change/${action}`, body: null },
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
    await user.selectOptions(screen.getByLabelText('New state'), 'Night');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await user.click(within(confirmDialog('Apply run state')).getByRole('button', { name: 'Apply' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Failed:/);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('surfaces a network failure the same way', async () => {
    const user = userEvent.setup();
    stubStates();
    server.use(http.post('/api/v3/states/change/:action', () => HttpResponse.error()));
    renderChooser();

    await waitFor(() => expect(screen.getByRole('option', { name: 'Night' })).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('New state'), 'stop');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await user.click(within(confirmDialog('Stop ZoneMinder')).getByRole('button', { name: 'Stop' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Failed:/);
  });

  it('renders nothing at all while closed', () => {
    stubStates();
    renderChooser({ isOpen: false });
    expect(screen.queryByLabelText('New state')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

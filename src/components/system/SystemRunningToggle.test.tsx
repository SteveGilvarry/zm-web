import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { SystemRunningToggle } from './SystemRunningToggle';
import { useAuthStore } from '@/stores/auth';

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', user: null, isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'warn' });
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

function seed(running: boolean, states: Array<{ id: number; name: string; is_active: number }> = []) {
  server.use(
    http.get('/api/v3/system/status', () => HttpResponse.json({ running, daemons: [], stats: {} })),
    http.get('/api/v3/states', () => HttpResponse.json({
      items: states.map((s) => ({ ...s, definition: '' })),
      total: states.length, per_page: 200, current_page: 1, last_page: 1,
    })),
  );
}

async function openChooser(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /change run state/i }));
  return screen.findByRole('dialog', { name: /run state/i });
}

describe('SystemRunningToggle — display', () => {
  it("shows 'RUNNING' when status.running is true", async () => {
    seed(true);
    renderWithProviders(<SystemRunningToggle />);
    await waitFor(() => expect(screen.getByText(/^running$/i)).toBeInTheDocument());
  });

  it("shows 'STOPPED' when status.running is false", async () => {
    seed(false);
    renderWithProviders(<SystemRunningToggle />);
    await waitFor(() => expect(screen.getByText(/^stopped$/i)).toBeInTheDocument());
  });
});

describe('SystemRunningToggle — run-state chooser (R3)', () => {
  it('opens the chooser listing Start/Stop/Restart and the saved states', async () => {
    seed(true, [{ id: 1, name: 'default', is_active: 1 }, { id: 2, name: 'Away', is_active: 0 }, { id: 3, name: 'stop', is_active: 0 }]);
    const user = userEvent.setup();
    renderWithProviders(<SystemRunningToggle />);
    await waitFor(() => screen.getByText(/^running$/i));
    const dialog = await openChooser(user);
    const select = within(dialog).getByRole('combobox');
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Away' })).toBeInTheDocument());
    expect(within(select).getByRole('option', { name: 'Start' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'default (active)' })).toBeInTheDocument();
    // a saved row literally named "stop" is not listed twice
    expect(within(select).getAllByRole('option', { name: 'Stop' })).toHaveLength(1);
    expect(within(dialog).getByRole('button', { name: /^apply$/i })).toBeDisabled();
  });

  it('Start: choose, Apply, confirm → POST /server/control/start', async () => {
    seed(false);
    let hits = 0;
    server.use(http.post('/api/v3/server/control/start', () => { hits += 1; return HttpResponse.json({ message: 'ok' }); }));
    const user = userEvent.setup();
    renderWithProviders(<SystemRunningToggle />);
    await waitFor(() => screen.getByText(/^stopped$/i));
    const dialog = await openChooser(user);
    await user.selectOptions(within(dialog).getByRole('combobox'), 'start');
    await user.click(within(dialog).getByRole('button', { name: /^apply$/i }));
    expect(hits).toBe(0);
    const confirm = await screen.findByRole('dialog', { name: /start zoneminder/i });
    await user.click(within(confirm).getByRole('button', { name: /^start$/i }));
    await waitFor(() => expect(hits).toBe(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('Stop: cancelling the confirm sends nothing', async () => {
    seed(true);
    let hits = 0;
    server.use(http.post('/api/v3/server/control/stop', () => { hits += 1; return HttpResponse.json({ message: 'ok' }); }));
    const user = userEvent.setup();
    renderWithProviders(<SystemRunningToggle />);
    await waitFor(() => screen.getByText(/^running$/i));
    const dialog = await openChooser(user);
    await user.selectOptions(within(dialog).getByRole('combobox'), 'stop');
    await user.click(within(dialog).getByRole('button', { name: /^apply$/i }));
    const confirm = await screen.findByRole('dialog', { name: /stop zoneminder/i });
    await user.click(within(confirm).getByRole('button', { name: /cancel/i }));
    expect(hits).toBe(0);
    // back on the chooser with the selection kept
    expect(await screen.findByRole('dialog', { name: /run state/i })).toBeInTheDocument();
  });

  it('a saved state applies via POST /system/state', async () => {
    seed(true, [{ id: 2, name: 'Away', is_active: 0 }]);
    let body: unknown = null;
    server.use(http.post('/api/v3/system/state', async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ success: true, message: 'applied' });
    }));
    const user = userEvent.setup();
    renderWithProviders(<SystemRunningToggle variant="banner" />);
    await waitFor(() => screen.getByText(/^running$/i));
    const dialog = await openChooser(user);
    await waitFor(() => within(dialog).getByRole('option', { name: 'Away' }));
    await user.selectOptions(within(dialog).getByRole('combobox'), 'Away');
    await user.click(within(dialog).getByRole('button', { name: /^apply$/i }));
    const confirm = await screen.findByRole('dialog', { name: /apply run state/i });
    await user.click(within(confirm).getByRole('button', { name: /^apply$/i }));
    await waitFor(() => expect(body).toEqual({ state_name: 'Away' }));
  });
});

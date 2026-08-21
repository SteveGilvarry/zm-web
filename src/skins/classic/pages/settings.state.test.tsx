/**
 * Options → Run State (classic skin): the saved-state table, the definition
 * preview, rename-in-place, the snapshot form and the daemon supervisor —
 * every destructive verb behind the legacy confirm.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/components/common/toastStore';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: ReactNode; to?: string; search?: unknown }) => {
    delete rest.search;
    return <a href={to ?? '#'} {...rest}>{children}</a>;
  },
  useSearch: () => ({}),
  useNavigate: () => vi.fn(),
}));
vi.mock('@/skins/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const ALL_EDIT = {
  stream: 'Edit', events: 'Edit', control: 'Edit', monitors: 'Edit',
  groups: 'Edit', devices: 'Edit', snapshots: 'Edit', system: 'Edit',
};
const ADMIN = { iat: 0, exp: 4102444800, user: 'admin', uid: 1, perms: ALL_EDIT };
const VIEWER = { ...ADMIN, user: 'viewer', uid: 2, perms: { ...ALL_EDIT, system: 'View' } };

function signIn(user: unknown = ADMIN) {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', isAuthenticated: true, user: user as never,
  });
}

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  useToastStore.getState().clear();
});
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

const paged = <T,>(items: T[], over: Record<string, number> = {}) => ({
  items, total: items.length, per_page: 200, current_page: 1, last_page: 1, ...over,
});

const STATES = [
  { id: 1, name: 'default', definition: '1:Always:Always:OnMotion,2:None:None:None', is_active: 1 },
  { id: 2, name: 'Away', definition: '1:Always:Always:Always,9:Always:None:None', is_active: 0 },
  { id: 3, name: 'Holiday', definition: '', is_active: 0 },
  // Reserved synthetic rows the legacy modal invents; never listed.
  { id: 4, name: 'restart', definition: '', is_active: 0 },
];

const MONITORS = [
  { id: 1, name: 'Front Door', capturing: 'Always', analysing: 'Always', recording: 'OnMotion', width: 1920, height: 1080, orientation: 'ROTATE_0', type: 'Ffmpeg' },
  { id: 2, name: 'Driveway', capturing: 'None', analysing: 'None', recording: 'None', width: 1920, height: 1080, orientation: 'ROTATE_90', type: 'Ffmpeg' },
];

let sent: Array<{ method: string; path: string; body: unknown }> = [];

function seed(over: unknown[] = []) {
  sent = [];
  server.use(
    ...(over as never[]),
    http.get('/api/v3/configs/categories', () => HttpResponse.json([{ category: 'system', count: 2 }])),
    http.get('/api/v3/configs/:name', ({ params }) =>
      HttpResponse.json({ id: 0, name: params.name, value: '', type: 'string', category: 'web', readonly: 0 })),
    http.get('/api/v3/states', () => HttpResponse.json(paged(STATES))),
    http.get('/api/v3/monitors', () => HttpResponse.json(paged(MONITORS))),
    http.post('/api/v3/system/state', async ({ request }) => {
      const body = await request.json();
      sent.push({ method: 'POST', path: '/system/state', body });
      return HttpResponse.json({ success: true, message: 'applied' });
    }),
    http.post('/api/v3/states/change/:action', ({ params }) => {
      sent.push({ method: 'POST', path: `/states/change/${params.action}`, body: null });
      return HttpResponse.json({ message: 'zmpkg.pl restart' });
    }),
    http.post('/api/v3/states', async ({ request }) => {
      const body = await request.json();
      sent.push({ method: 'POST', path: '/states', body });
      return HttpResponse.json({ id: 7, ...(body as object) });
    }),
    http.patch('/api/v3/states/:id', async ({ request, params }) => {
      const body = await request.json();
      sent.push({ method: 'PATCH', path: `/states/${params.id}`, body });
      return HttpResponse.json({ id: Number(params.id), definition: '', is_active: 0, ...(body as object) });
    }),
    http.delete('/api/v3/states/:id', ({ params }) => {
      sent.push({ method: 'DELETE', path: `/states/${params.id}`, body: null });
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

async function mount() {
  const { default: Page } = await import('./settings.state');
  return renderWithProviders(<Page />);
}

/** The <tr> holding a state, found via its Apply button. */
function rowFor(name: string) {
  return screen.getByRole('button', { name: `Apply state ${name}` }).closest('tr')!;
}

describe('ClassicSettingsStatePage', () => {
  it('lists the saved states, hides the reserved names and marks the active one', async () => {
    signIn();
    seed();
    await mount();

    await waitFor(() => expect(screen.getByText('default')).toBeInTheDocument());
    expect(screen.getByText('Away')).toBeInTheDocument();
    expect(screen.queryByText('restart')).toBeNull();

    // Active row: Apply is disabled, "Active" shown.
    const def = rowFor('default');
    expect(within(def).getByText('Active')).toBeInTheDocument();
    expect(within(def).getByRole('button', { name: 'Apply state default' })).toBeDisabled();
    // `default` is protected: not renameable, not deletable.
    expect(within(def).getByRole('button', { name: 'Delete state default' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Rename default' })).toBeNull();

    // A definition-less state shows an em-dash instead of the preview toggle.
    // Not active and no definition: an em-dash in both columns.
    expect(within(rowFor('Holiday')).getAllByText('—')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Show definition of Holiday' })).toBeNull();
  });

  it('expands a definition and names monitors that no longer exist', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();

    const toggle = await screen.findByRole('button', { name: 'Show definition of Away' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const table = screen.getByRole('table', { name: 'Definition of Away' });
    expect(within(table).getByText('Front Door')).toBeInTheDocument();
    // Monitor 9 is gone from the fleet.
    expect(within(table).getByText('Monitor 9')).toBeInTheDocument();
    expect(within(table).getByText('(no longer exists)')).toBeInTheDocument();

    await user.click(toggle);
    expect(screen.queryByRole('table', { name: 'Definition of Away' })).toBeNull();
  });

  it('Apply confirms, then POSTs /system/state with the state name', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();

    await user.click(await screen.findByRole('button', { name: 'Apply state Away' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Apply state "Away"?');
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(sent).toEqual([
      { method: 'POST', path: '/system/state', body: { state_name: 'Away' } },
    ]));
  });

  it('Delete confirms, then DELETEs the row; Cancel sends nothing', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();

    await user.click(await screen.findByRole('button', { name: 'Delete state Away' }));
    let dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Delete saved state "Away"?');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(sent).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Delete state Away' }));
    dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(sent).toEqual([{ method: 'DELETE', path: '/states/2', body: null }]));
  });

  it('renames in place with Enter and abandons on Escape', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();

    await user.click(await screen.findByRole('button', { name: 'Rename Away' }));
    let field = screen.getByLabelText('New name for Away');
    expect(field).toHaveValue('Away');
    await user.clear(field);
    await user.type(field, 'Vacation{Enter}');
    await waitFor(() => expect(sent).toEqual([
      { method: 'PATCH', path: '/states/2', body: { name: 'Vacation' } },
    ]));

    // Escape closes the editor without a second request.
    await user.click(await screen.findByRole('button', { name: 'Rename Away' }));
    field = screen.getByLabelText('New name for Away');
    await user.clear(field);
    await user.type(field, 'Nope{Escape}');
    await waitFor(() => expect(screen.queryByLabelText('New name for Away')).toBeNull());
    expect(sent).toHaveLength(1);
  });

  it('refuses a reserved rename with a toast instead of a request', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();

    await user.click(await screen.findByRole('button', { name: 'Rename Away' }));
    const field = screen.getByLabelText('New name for Away');
    await user.clear(field);
    await user.type(field, 'restart{Enter}');

    await waitFor(() => expect(useToastStore.getState().toasts.map((t) => t.message)).toContain(
      '"restart" is a reserved name. Choose another.'));
    expect(sent).toHaveLength(0);
  });

  it('snapshots the current fleet as a new state', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();

    await waitFor(() => expect(screen.getByText('2 monitors will be captured.')).toBeInTheDocument());
    const field = screen.getByLabelText('Save current as…');
    const submit = screen.getByRole('button', { name: 'Save snapshot' });
    expect(submit).toBeDisabled();

    await user.type(field, 'Night');
    await user.click(submit);
    await waitFor(() => expect(sent).toEqual([{
      method: 'POST',
      path: '/states',
      body: {
        name: 'Night',
        definition: '1:Always:Always:OnMotion,2:None:None:None',
        is_active: 0,
      },
    }]));
  });

  it('refuses a duplicate snapshot name', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();

    await waitFor(() => expect(screen.getByText('Away')).toBeInTheDocument());
    await user.type(screen.getByLabelText('Save current as…'), 'away');
    await user.click(screen.getByRole('button', { name: 'Save snapshot' }));

    await waitFor(() => expect(useToastStore.getState().toasts.map((t) => t.message)).toContain(
      'A state named "away" already exists.'));
    expect(sent).toHaveLength(0);
  });

  it('the daemon supervisor confirms before POSTing start / stop / restart', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();

    await user.click(await screen.findByRole('button', { name: 'Stop' }));
    let dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Stop ZoneMinder? Recording will halt across every monitor.');
    await user.click(within(dialog).getByRole('button', { name: 'Stop' }));
    await waitFor(() => expect(sent).toEqual([{ method: 'POST', path: '/states/change/stop', body: null }]));
    // The response message is echoed next to the buttons.
    expect(await screen.findByText('zmpkg.pl restart')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Restart' }));
    dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Restart ZoneMinder?');
    await user.click(within(dialog).getByRole('button', { name: 'Restart' }));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1].path).toBe('/states/change/restart');

    await user.click(screen.getByRole('button', { name: 'Start' }));
    dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Start ZoneMinder?');
    await user.click(within(dialog).getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(sent).toHaveLength(3));
    expect(sent[2].path).toBe('/states/change/start');
  });

  it('shows a failed supervisor call inline', async () => {
    signIn();
    seed([
      http.post('/api/v3/states/change/:action', () =>
        HttpResponse.json({ kind: 'INTERNAL', error_message: 'zmpkg.pl not found' }, { status: 500 })),
    ]);
    const user = userEvent.setup();
    await mount();

    await user.click(await screen.findByRole('button', { name: 'Stop' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Stop' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('zmpkg.pl not found'));
  });

  it('renders the empty state when nothing is saved yet', async () => {
    signIn();
    seed([http.get('/api/v3/states', () => HttpResponse.json(paged([])))]);
    await mount();
    await waitFor(() => {
      const status = screen.getByRole('status');
      expect(status).toHaveAttribute('data-state', 'empty');
      expect(status).toHaveTextContent('No saved states yet.');
    });
  });

  it('renders the 500 branch as an alert', async () => {
    signIn();
    seed([
      http.get('/api/v3/states', () =>
        HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'States table locked' }, { status: 500 })),
    ]);
    await mount();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveAttribute('data-state', 'unreachable'));
  });

  it('renders a network failure as unreachable', async () => {
    signIn();
    seed([http.get('/api/v3/states', () => HttpResponse.error())]);
    await mount();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveAttribute('data-state', 'unreachable'));
  });

  it('read-only without system Edit: supervisor replaced by a notice, no verbs, no snapshot form', async () => {
    signIn(VIEWER);
    seed();
    await mount();

    await waitFor(() => expect(screen.getByText('Away')).toBeInTheDocument());
    expect(screen.getByText('You do not have permission to view this.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Apply state Away' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Rename Away' })).toBeNull();
    expect(screen.queryByLabelText('Save current as…')).toBeNull();
  });

  it('renders nothing when signed out', async () => {
    useAuthStore.setState({ accessToken: null, refreshToken: null, isAuthenticated: false, user: null });
    const { container } = await mount();
    expect(container).toBeEmptyDOMElement();
  });
});

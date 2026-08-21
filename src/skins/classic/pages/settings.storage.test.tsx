/**
 * Options → Storage (classic skin): the legacy storage table, its add/edit
 * modal, the enable toggle and the delete guard that counts events first.
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
  items, total: items.length, per_page: 25, current_page: 1, last_page: 1, ...over,
});

const STORAGE = [
  { id: 1, name: 'Default', path: '/var/cache/zoneminder/events', type: 'local', enabled: 1 },
  { id: 2, name: 'Cold archive', path: '/mnt/cold', type: 's3fs', enabled: 0 },
];

let sent: Array<{ method: string; path: string; body: unknown }> = [];
/** Events reported by /filters/preview when the delete guard counts. */
let usageTotal = 0;

function seed(over: unknown[] = []) {
  sent = [];
  usageTotal = 0;
  server.use(
    ...(over as never[]),
    http.get('/api/v3/configs/categories', () => HttpResponse.json([{ category: 'system', count: 2 }])),
    http.get('/api/v3/configs/:name', ({ params }) =>
      HttpResponse.json({ id: 0, name: params.name, value: '', type: 'string', category: 'web', readonly: 0 })),
    http.get('/api/v3/storage', () => HttpResponse.json(paged(STORAGE))),
    http.get('/api/v3/servers', () => HttpResponse.json(paged([{ id: 3, name: 'edge-01', hostname: 'h', port: null, status: 'Running' }]))),
    http.post('/api/v3/filters/preview', () => HttpResponse.json(paged([], { total: usageTotal }))),
    http.post('/api/v3/storage', async ({ request }) => {
      const body = await request.json();
      sent.push({ method: 'POST', path: '/storage', body });
      return HttpResponse.json({ id: 9, ...(body as object) });
    }),
    http.patch('/api/v3/storage/:id', async ({ request, params }) => {
      const body = await request.json();
      sent.push({ method: 'PATCH', path: `/storage/${params.id}`, body });
      return HttpResponse.json({ id: Number(params.id), ...(body as object) });
    }),
    http.delete('/api/v3/storage/:id', ({ params }) => {
      sent.push({ method: 'DELETE', path: `/storage/${params.id}`, body: null });
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

async function mount() {
  const { default: Page } = await import('./settings.storage');
  return renderWithProviders(<Page />);
}

describe('ClassicSettingsStoragePage', () => {
  it('renders the legacy storage table', async () => {
    signIn();
    seed();
    await mount();

    const row = (await screen.findByRole('button', { name: 'Default' })).closest('tr')!;
    expect(within(row).getByText('/var/cache/zoneminder/events')).toBeInTheDocument();
    expect(within(row).getByText('local')).toBeInTheDocument();
    // enabled === 1 → the toggle is ticked and offers to disable.
    expect(within(row).getByRole('checkbox', { name: 'Disable Default' })).toBeChecked();
    // "Default" is the install row: never deletable.
    expect(within(row).getByRole('button', { name: 'Delete Default' })).toBeDisabled();

    const cold = screen.getByRole('button', { name: 'Cold archive' }).closest('tr')!;
    expect(within(cold).getByRole('checkbox', { name: 'Enable Cold archive' })).not.toBeChecked();
    expect(within(cold).getByRole('button', { name: 'Delete Cold archive' })).toBeEnabled();
  });

  it('the search box narrows the list by name or path', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();
    await screen.findByRole('button', { name: 'Default' });

    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'cold');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Default' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Cold archive' })).toBeInTheDocument();

    // A path match counts too.
    await user.clear(screen.getByRole('searchbox', { name: 'Search' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search' }), '/var/cache');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Cold archive' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Default' })).toBeInTheDocument();

    // No match → the empty state.
    await user.clear(screen.getByRole('searchbox', { name: 'Search' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'zzz');
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveAttribute('data-state', 'empty'));
    expect(screen.getByRole('status')).toHaveTextContent('No matching records found');
  });

  it('the enable checkbox PATCHes the flag as a 0/1 int', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();

    await user.click(await screen.findByRole('checkbox', { name: 'Enable Cold archive' }));
    await waitFor(() => expect(sent).toEqual([
      { method: 'PATCH', path: '/storage/2', body: { enabled: 1 } },
    ]));
  });

  it('Add New Storage POSTs the whole payload with blanks nulled out', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();
    await screen.findByRole('button', { name: 'Default' });

    await user.click(screen.getByRole('button', { name: 'Add New Storage' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Add Storage')).toBeInTheDocument();

    // Create starts disabled until name + path are filled.
    expect(within(dialog).getByRole('button', { name: 'Create Storage' })).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Name'), 'Warm');
    await user.type(within(dialog).getByLabelText('Path'), '/mnt/warm');
    await user.selectOptions(within(dialog).getByLabelText('Type'), 's3fs');
    await user.selectOptions(within(dialog).getByLabelText('Scheme'), 'Deep');
    await user.selectOptions(within(dialog).getByLabelText('Server'), '3');
    await user.click(within(dialog).getByRole('button', { name: 'Create Storage' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({
      method: 'POST',
      path: '/storage',
      body: {
        name: 'Warm', path: '/mnt/warm', type: 's3fs', enabled: 1,
        scheme: 'Deep', server_id: 3, url: null,
      },
    });
  });

  it('editing keeps the current scheme unless one is picked', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();

    await user.click(await screen.findByRole('button', { name: 'Edit Cold archive' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Cold archive');
    expect(within(dialog).getByLabelText('Path')).toHaveValue('/mnt/cold');
    // The backend cannot echo scheme, so the edit form opens on "keep current".
    expect(within(dialog).getByLabelText('Scheme')).toHaveValue('');
    // enabled 0 → unchecked; tick it and save.
    expect(within(dialog).getByLabelText('Enabled')).not.toBeChecked();
    await user.click(within(dialog).getByLabelText('Enabled'));
    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].method).toBe('PATCH');
    expect(sent[0].path).toBe('/storage/2');
    expect(sent[0].body).toEqual({
      name: 'Cold archive', path: '/mnt/cold', type: 's3fs', enabled: 1,
      server_id: null, url: null,
    });
    // `scheme: undefined` is dropped by JSON.stringify — assert it never went out.
    expect(Object.keys(sent[0].body as object)).not.toContain('scheme');
  });

  it('Cancel closes the modal without a request', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();
    await user.click(await screen.findByRole('button', { name: 'Edit Default' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(sent).toHaveLength(0);
  });

  it('reports a failed save inside the modal', async () => {
    signIn();
    seed([
      http.post('/api/v3/storage', () =>
        HttpResponse.json({ kind: 'VALIDATION', error_message: 'path is not writable' }, { status: 422 })),
    ]);
    const user = userEvent.setup();
    await mount();
    await screen.findByRole('button', { name: 'Default' });

    await user.click(screen.getByRole('button', { name: 'Add New Storage' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Name'), 'Bad');
    await user.type(within(dialog).getByLabelText('Path'), '/nope');
    await user.click(within(dialog).getByRole('button', { name: 'Create Storage' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Save failed: path is not writable');
  });

  it('delete counts events first, then DELETEs when none reference the area', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();

    await user.click(await screen.findByRole('button', { name: 'Delete Cold archive' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() =>
      expect(dialog).toHaveTextContent('No events reference "Cold archive". Delete it? This cannot be undone.'));
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(sent).toEqual([{ method: 'DELETE', path: '/storage/2', body: null }]));
  });

  it('delete is blocked while events still live on the area', async () => {
    signIn();
    seed();
    usageTotal = 12;
    const user = userEvent.setup();
    await mount();

    await user.click(await screen.findByRole('button', { name: 'Delete Cold archive' }));
    await waitFor(() =>
      expect(screen.getByRole('dialog')).toHaveTextContent(
        '"Cold archive" still holds 12 events. Move or delete those events before removing the storage area.'));
    // Only an OK button — no way to force it through.
    expect(within(screen.getByRole('dialog')).queryByRole('button', { name: 'Delete' })).toBeNull();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'OK' }));
    expect(sent).toHaveLength(0);
  });

  it('offers a delete-anyway path when the count itself fails', async () => {
    signIn();
    seed([
      http.post('/api/v3/filters/preview', () =>
        HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'preview unavailable' }, { status: 500 })),
    ]);
    const user = userEvent.setup();
    await mount();

    await user.click(await screen.findByRole('button', { name: 'Delete Cold archive' }));
    await waitFor(() =>
      expect(screen.getByRole('dialog')).toHaveTextContent(
        'Could not count events on "Cold archive" (preview unavailable). Delete anyway? This cannot be undone.'));
  });

  it('renders the 500 branch as an alert', async () => {
    signIn();
    seed([
      http.get('/api/v3/storage', () =>
        HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'Storage table locked' }, { status: 500 })),
    ]);
    await mount();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveAttribute('data-state', 'unreachable');
    expect(alert).toHaveTextContent('Cannot reach the server.');
  });

  it('renders a network failure as unreachable', async () => {
    signIn();
    seed([http.get('/api/v3/storage', () => HttpResponse.error())]);
    await mount();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveAttribute('data-state', 'unreachable'));
  });

  it('renders the 403 branch as a permission notice', async () => {
    signIn();
    seed([
      http.get('/api/v3/storage', () =>
        HttpResponse.json({ kind: 'FORBIDDEN', error_message: 'nope' }, { status: 403 })),
    ]);
    await mount();
    await waitFor(() =>
      expect(screen.getByText('You do not have permission to view this.')).toBeInTheDocument());
  });

  it('pages when the backend reports more than one page', async () => {
    signIn();
    seed([
      http.get('/api/v3/storage', ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page'));
        return HttpResponse.json({
          items: page === 1 ? [STORAGE[0]] : [STORAGE[1]],
          total: 2, per_page: 1, current_page: page, last_page: 2,
        });
      }),
    ]);
    const user = userEvent.setup();
    await mount();

    await screen.findByRole('button', { name: 'Default' });
    expect(screen.getByText('Page 1 of 2 (2 total)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Prev' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('button', { name: 'Cold archive' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Prev' }));
    expect(await screen.findByRole('button', { name: 'Default' })).toBeInTheDocument();
  });

  it('read-only without system Edit: plain names, Yes/No, no verbs', async () => {
    signIn(VIEWER);
    seed();
    await mount();

    await waitFor(() => expect(screen.getByText('Cold archive')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Cold archive' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add New Storage' })).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getByText('No')).toBeInTheDocument();
  });

  it('renders nothing when signed out', async () => {
    useAuthStore.setState({ accessToken: null, refreshToken: null, isAuthenticated: false, user: null });
    const { container } = await mount();
    expect(container).toBeEmptyDOMElement();
  });
});

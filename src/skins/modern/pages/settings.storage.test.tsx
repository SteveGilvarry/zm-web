import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { makeServer, makeStorage } from '@/test/fixtures/admin';
import { useAuthStore } from '@/stores/auth';

vi.mock('@/skins/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
// The Events deep-link is a router <Link>; no router is mounted here.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to?: string }) => (
    <a href={to ?? '#'} {...rest}>{children}</a>
  ),
}));

const { default: StoragePage } = await import('./settings.storage');

const server = setupServer();

beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', user: { iat: 0, exp: 4102444800, user: 'admin', uid: 1 }, isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'warn' });
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

const GIB = 1024 ** 3;
const DEFAULT_ROW = makeStorage({ disk_space: 40 * GIB, server_id: 0, do_delete: 1 });
const ARCHIVE_ROW = makeStorage({
  id: 2, name: 'Archive', path: '/mnt/archive', type: 's3fs', enabled: 0,
  scheme: 'Deep', server_id: 4, url: 's3://bucket/zm', disk_space: 10 * GIB, do_delete: 0,
});

function seedStorage(eventsOnArchive = 0, storage: unknown[] = [DEFAULT_ROW, ARCHIVE_ROW]) {
  server.use(
    http.get('/api/v3/storage', () => HttpResponse.json({
      items: storage,
      total: storage.length, per_page: 25, current_page: 1, last_page: 1,
    })),
    http.get('/api/v3/servers', () => HttpResponse.json({
      items: [makeServer({ id: 4, name: 'zm-edge-01', hostname: 'edge' })],
      total: 1, per_page: 200, current_page: 1, last_page: 1,
    })),
    http.post('/api/v3/filters/preview', () => HttpResponse.json({
      items: [], total: eventsOnArchive, per_page: 1, current_page: 1, last_page: 1,
    })),
  );
}

describe('Storage page', () => {
  it('lists storage areas', async () => {
    seedStorage();
    renderWithProviders(<StoragePage />);
    await waitFor(() => expect(screen.getByText('Default')).toBeInTheDocument());
    expect(screen.getByText('/mnt/archive')).toBeInTheDocument();
    expect(screen.getByText('s3fs')).toBeInTheDocument();
  });

  it('shows the legacy columns: id, scheme, server and disk space', async () => {
    seedStorage();
    renderWithProviders(<StoragePage />);
    const archive = (await screen.findByText('Archive')).closest('tr')!;
    const dflt = screen.getByText('Default').closest('tr')!;

    expect(within(dflt).getByText('1')).toBeInTheDocument();
    expect(within(dflt).getByText('Medium')).toBeInTheDocument();
    // ServerId 0 is ZoneMinder's "every server can reach this path".
    expect(within(dflt).getByText('Local')).toBeInTheDocument();
    expect(within(dflt).getByText('40.0 GB')).toBeInTheDocument();

    expect(within(archive).getByText('Deep')).toBeInTheDocument();
    await waitFor(() => expect(within(archive).getByText('zm-edge-01')).toBeInTheDocument());
    expect(within(archive).getByText('10.0 GB')).toBeInTheDocument();
  });

  it('scales the disk bar against the largest area and says so', async () => {
    seedStorage();
    renderWithProviders(<StoragePage />);
    await waitFor(() => expect(screen.getByText('Archive')).toBeInTheDocument());

    const bars = screen.getAllByRole('progressbar');
    expect(bars.map((b) => b.getAttribute('aria-valuenow'))).toEqual(['100', '25']);
    // Honest label: no percentage-of-disk is claimed.
    expect(bars[1]).toHaveAccessibleName(
      '10.0 GB of events on this storage area, as last cached by zmaudit. The bar compares it with the largest storage area listed, not with the size of the disk.',
    );
  });

  it('shows an em dash and no bar when zmaudit has no figure', async () => {
    seedStorage(0, [makeStorage({ disk_space: null })]);
    renderWithProviders(<StoragePage />);
    await waitFor(() => expect(screen.getByText('Default')).toBeInTheDocument());
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByText('\u2014')).toBeInTheDocument();
  });

  it('filters by name or path client-side', async () => {
    seedStorage();
    const user = userEvent.setup();
    renderWithProviders(<StoragePage />);
    await waitFor(() => expect(screen.getByText('Default')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText('Search storage...'), 'archive');
    expect(screen.queryByText('Default')).not.toBeInTheDocument();
    expect(screen.getByText('Archive')).toBeInTheDocument();
  });

  it('opens the Add Storage modal and creates via POST', async () => {
    seedStorage();
    let body: unknown = null;
    server.use(
      http.post('/api/v3/storage', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: 3, ...(body as object) }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<StoragePage />);
    await waitFor(() => expect(screen.getByText('Default')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /add storage/i }));
    // One change event per field rather than user.type: Modal's focus-trap
    // effect re-runs on every render (its deps include the per-render onClose)
    // and re-focuses the first field, so per-keystroke typing in jsdom loses
    // every character after the first. Pre-existing; not this test's subject.
    fireEvent.change(screen.getByPlaceholderText('Storage name'), { target: { value: 'Fast' } });
    fireEvent.change(screen.getByPlaceholderText('/var/cache/zoneminder'), { target: { value: '/mnt/fast' } });
    await user.click(screen.getByRole('button', { name: /create storage/i }));

    await waitFor(() => expect(body).toEqual({
      name: 'Fast', path: '/mnt/fast', type: 'local', enabled: 1,
      scheme: 'Medium', server_id: null, url: null,
    }));
  });

  it('toggles Enabled with a PATCH', async () => {
    seedStorage();
    let method = '';
    let body: unknown = null;
    server.use(
      http.all('/api/v3/storage/2', async ({ request }) => {
        method = request.method;
        body = await request.json();
        return HttpResponse.json(makeStorage({ id: 2, name: 'Archive', path: '/mnt/archive', type: 's3fs' }));
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<StoragePage />);
    await waitFor(() => expect(screen.getByText('Archive')).toBeInTheDocument());

    await user.click(screen.getByRole('switch', { name: /enable archive/i }));
    await waitFor(() => expect(method).toBe('PATCH'));
    expect(body).toEqual({ enabled: 1 });
  });

  it('shows the backend message when a toggle fails', async () => {
    seedStorage();
    server.use(
      http.patch('/api/v3/storage/2', () => HttpResponse.json(
        { error: 'Method Not Allowed', message: 'Method Not Allowed' }, { status: 405 },
      )),
    );
    const user = userEvent.setup();
    renderWithProviders(<StoragePage />);
    await waitFor(() => expect(screen.getByText('Archive')).toBeInTheDocument());

    await user.click(screen.getByRole('switch', { name: /enable archive/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Update failed: Method Not Allowed'));
  });

  it('keeps the edit modal open and shows the message when save fails', async () => {
    seedStorage();
    server.use(
      http.patch('/api/v3/storage/1', () => HttpResponse.json(
        { error: 'Conflict', message: 'path already in use' }, { status: 409 },
      )),
    );
    const user = userEvent.setup();
    renderWithProviders(<StoragePage />);
    await waitFor(() => expect(screen.getByText('Default')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /edit default/i }));
    fireEvent.change(screen.getByPlaceholderText('/var/cache/zoneminder'), { target: { value: '/mnt/archive' } });
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Save failed: path already in use'));
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });
});

describe('Storage page — scheme / server / url (ST2)', () => {
  it('sends scheme, server_id and url on create', async () => {
    seedStorage();
    let body: unknown = null;
    server.use(http.post('/api/v3/storage', async ({ request }) => {
      body = await request.json();
      return HttpResponse.json(makeStorage({ id: 3, name: 'Bulk', path: '/mnt/bulk' }));
    }));
    const user = userEvent.setup();
    renderWithProviders(<StoragePage />);
    await waitFor(() => expect(screen.getByText('Default')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /add storage/i }));
    await user.type(screen.getByPlaceholderText('Storage name'), 'Bulk');
    await user.type(screen.getByPlaceholderText('/var/cache/zoneminder'), '/mnt/bulk');
    await user.selectOptions(screen.getByLabelText('Scheme'), 'Deep');
    await waitFor(() => expect(screen.getByRole('option', { name: 'zm-edge-01' })).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('Server'), '4');
    await user.type(screen.getByLabelText('URL'), 's3://bucket/zm');
    await user.click(screen.getByRole('button', { name: /create storage/i }));
    await waitFor(() => expect(body).toEqual({
      name: 'Bulk', path: '/mnt/bulk', type: 'local', enabled: 1,
      scheme: 'Deep', server_id: 4, url: 's3://bucket/zm',
    }));
  });

  it('opens the edit form on the stored row and PATCHes the whole of it back', async () => {
    seedStorage();
    let body: Record<string, unknown> | null = null;
    server.use(http.patch('/api/v3/storage/2', async ({ request }) => {
      body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json(makeStorage({ id: 2, name: 'Archive' }));
    }));
    const user = userEvent.setup();
    renderWithProviders(<StoragePage />);
    await waitFor(() => expect(screen.getByText('Archive')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /edit archive/i }));

    // Populated from the row, not from the create defaults.
    expect(screen.getByLabelText('Scheme')).toHaveValue('Deep');
    await waitFor(() => expect(screen.getByLabelText('Server')).toHaveValue('4'));
    expect(screen.getByLabelText('URL')).toHaveValue('s3://bucket/zm');

    await user.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toEqual({
      name: 'Archive', path: '/mnt/archive', type: 's3fs', enabled: 0,
      scheme: 'Deep', server_id: 4, url: 's3://bucket/zm',
    });
  });

  it('shows DoDelete read-only, with why it cannot be changed', async () => {
    seedStorage();
    const user = userEvent.setup();
    renderWithProviders(<StoragePage />);
    await waitFor(() => expect(screen.getByText('Archive')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /edit archive/i }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Auto-delete')).toBeInTheDocument();
    expect(within(dialog).getByText('No')).toBeInTheDocument();
    expect(within(dialog).getByText('Set by ZoneMinder; the API cannot change it yet.')).toBeInTheDocument();
    // Neither write schema carries do_delete, so there is nothing to click.
    expect(within(dialog).queryByRole('switch', { name: /auto-delete/i })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('checkbox', { name: /auto-delete/i })).not.toBeInTheDocument();
  });
});

describe('Storage page — delete guard (ST4)', () => {
  it('never offers to delete the Default row', async () => {
    seedStorage();
    renderWithProviders(<StoragePage />);
    await waitFor(() => expect(screen.getByText('Default')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /delete default/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /delete archive/i })).toBeEnabled();
  });

  it('blocks deletion while events still reference the storage area', async () => {
    seedStorage(136);
    let deletes = 0;
    server.use(http.delete('/api/v3/storage/:id', () => { deletes += 1; return new HttpResponse(null, { status: 204 }); }));
    const user = userEvent.setup();
    renderWithProviders(<StoragePage />);
    await waitFor(() => expect(screen.getByText('Archive')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /delete archive/i }));
    // no catalogue in tests, so the singular key renders for any count
    expect(await screen.findByText(/still holds 136 event/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^ok$/i }));
    expect(deletes).toBe(0);
  });

  it('counts via /filters/preview on storage_id, then deletes when empty', async () => {
    seedStorage(0);
    let previewBody: unknown = null;
    let deleted: string | null = null;
    server.use(
      http.post('/api/v3/filters/preview', async ({ request }) => {
        previewBody = await request.json();
        return HttpResponse.json({ items: [], total: 0, per_page: 1, current_page: 1, last_page: 1 });
      }),
      http.delete('/api/v3/storage/:id', ({ params }) => { deleted = params.id as string; return new HttpResponse(null, { status: 204 }); }),
    );
    const user = userEvent.setup();
    renderWithProviders(<StoragePage />);
    await waitFor(() => expect(screen.getByText('Archive')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /delete archive/i }));
    expect(await screen.findByText(/No events reference "Archive"/)).toBeInTheDocument();
    expect(previewBody).toEqual({ where: { field: 'storage_id', op: 'eq', value: 2 }, limit: null });
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    await waitFor(() => expect(deleted).toBe('2'));
  });
});

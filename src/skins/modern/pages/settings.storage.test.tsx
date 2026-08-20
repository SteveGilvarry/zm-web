import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';

vi.mock('@/skins/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const { default: StoragePage } = await import('./settings.storage');

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

function seedStorage(eventsOnArchive = 0) {
  server.use(
    http.get('/api/v3/storage', () => HttpResponse.json({
      items: [
        { id: 1, name: 'Default', path: '/var/cache/zoneminder/events', type: 'local', enabled: 1 },
        { id: 2, name: 'Archive', path: '/mnt/archive', type: 's3fs', enabled: 0 },
      ],
      total: 2, per_page: 25, current_page: 1, last_page: 1,
    })),
    http.get('/api/v3/servers', () => HttpResponse.json({
      items: [{ id: 4, name: 'zm-edge-01', hostname: 'edge', port: null, status: 'Running' }],
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
        return HttpResponse.json({ id: 2, name: 'Archive', path: '/mnt/archive', type: 's3fs', enabled: 1 });
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
      return HttpResponse.json({ id: 3, name: 'Bulk', path: '/mnt/bulk', type: 'local', enabled: 1 });
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
    expect(screen.getByText(/does not return them/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /create storage/i }));
    await waitFor(() => expect(body).toEqual({
      name: 'Bulk', path: '/mnt/bulk', type: 'local', enabled: 1,
      scheme: 'Deep', server_id: 4, url: 's3://bucket/zm',
    }));
  });

  it('omits scheme on edit unless the operator picks one', async () => {
    seedStorage();
    let body: Record<string, unknown> | null = null;
    server.use(http.patch('/api/v3/storage/2', async ({ request }) => {
      body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ id: 2, name: 'Archive', path: '/mnt/archive', type: 's3fs', enabled: 0 });
    }));
    const user = userEvent.setup();
    renderWithProviders(<StoragePage />);
    await waitFor(() => expect(screen.getByText('Archive')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /edit archive/i }));
    expect(screen.getByLabelText('Scheme')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(body).not.toBeNull());
    expect(body).not.toHaveProperty('scheme');
    expect(body).toMatchObject({ name: 'Archive', server_id: null, url: null });
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

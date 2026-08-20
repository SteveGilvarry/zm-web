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

function seedStorage() {
  server.use(
    http.get('/api/v3/storage', () => HttpResponse.json({
      items: [
        { id: 1, name: 'Default', path: '/var/cache/zoneminder/events', type: 'local', enabled: 1 },
        { id: 2, name: 'Archive', path: '/mnt/archive', type: 's3fs', enabled: 0 },
      ],
      total: 2, per_page: 25, current_page: 1, last_page: 1,
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
    }));
  });
});

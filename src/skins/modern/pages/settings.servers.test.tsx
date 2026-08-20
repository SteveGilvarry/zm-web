import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';

vi.mock('@/skins/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const { default: ServersPage } = await import('./settings.servers');

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

function seedServers(items: unknown[]) {
  server.use(
    http.get('/api/v3/servers', () => HttpResponse.json({
      items, total: items.length, per_page: 200, current_page: 1, last_page: 1,
    })),
  );
}

describe('Servers page', () => {
  it('lists registered servers with host:port', async () => {
    seedServers([
      { id: 1, name: 'zm-edge-01', hostname: '10.0.0.5', port: 8080, status: 'running' },
      { id: 2, name: 'zm-edge-02', hostname: '10.0.0.6', port: null, status: '' },
    ]);
    renderWithProviders(<ServersPage />);
    await waitFor(() => expect(screen.getByText('zm-edge-01')).toBeInTheDocument());
    expect(screen.getByText('10.0.0.5:8080')).toBeInTheDocument();
    expect(screen.getByText('10.0.0.6')).toBeInTheDocument();
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('shows the single-node hint when no servers exist', async () => {
    seedServers([]);
    renderWithProviders(<ServersPage />);
    await waitFor(() =>
      expect(screen.getByText(/No servers registered/)).toBeInTheDocument(),
    );
  });

  it('registers a new server via POST and clears the form', async () => {
    seedServers([]);
    let body: unknown = null;
    server.use(
      http.post('/api/v3/servers', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: 9, ...(body as object) }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<ServersPage />);
    await waitFor(() => expect(screen.getByText(/No servers registered/)).toBeInTheDocument());

    const nameInput = screen.getByPlaceholderText('e.g. zm-edge-01');
    await user.type(nameInput, 'edge-9');
    await user.type(screen.getByPlaceholderText('port'), '80x80');
    await user.click(screen.getByRole('button', { name: /register/i }));

    await waitFor(() => expect(body).toEqual({
      name: 'edge-9', hostname: null, port: 8080, status: 'unknown',
    }));
    await waitFor(() => expect(nameInput).toHaveValue(''));
  });
});

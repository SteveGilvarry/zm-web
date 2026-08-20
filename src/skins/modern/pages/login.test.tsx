import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';

const navigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useSearch: () => ({}),
}));

const { default: LoginPage } = await import('./login');

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
beforeEach(() => {
  useAuthStore.getState().clearAuth();
  navigate.mockClear();
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

describe('Login page', () => {
  it('POSTs credentials, stores tokens and navigates home', async () => {
    let body: unknown = null;
    server.use(
      http.post('/api/v3/auth/login', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          access_token: 'a.b.c',
          refresh_token: 'r.s.t',
          token_type: 'Bearer',
          expires_in: 3600,
        });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    await user.type(screen.getByLabelText(/username/i), 'admin');
    await user.type(screen.getByLabelText(/password/i), 'secret');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(body).toEqual({ username: 'admin', password: 'secret' }));
    await waitFor(() => expect(useAuthStore.getState().accessToken).toBe('a.b.c'));
    expect(navigate).toHaveBeenCalledWith({ to: '/', replace: true });
  });

  it('shows the backend error message when login fails', async () => {
    server.use(
      http.post('/api/v3/auth/login', () =>
        HttpResponse.json({ message: 'Bad credentials' }, { status: 401 }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    await user.type(screen.getByLabelText(/username/i), 'admin');
    await user.type(screen.getByLabelText(/password/i), 'nope');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(screen.getByText('Bad credentials')).toBeInTheDocument());
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });
});

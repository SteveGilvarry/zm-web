import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';

const navigate = vi.fn();
const mockSearch: { redirect?: string; reason?: string } = {};
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useSearch: () => ({ ...mockSearch }),
}));

const { default: ClassicLoginPage } = await import('./login');

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
beforeEach(() => {
  useAuthStore.getState().clearAuth();
  navigate.mockClear();
  delete mockSearch.reason;
  delete mockSearch.redirect;
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

describe('Classic login page', () => {
  it('renders the legacy form: brand bar, "<title> Login" heading, Username / Password, Login button', () => {
    renderWithProviders(<ClassicLoginPage />);
    expect(screen.getByRole('heading', { level: 1, name: /ZoneMinder Login/ })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Username')).toHaveFocus();
    expect(screen.getByPlaceholderText('Password')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
    expect(document.querySelector('.bg-void')).toBeNull();
  });

  it('signs in and navigates home with replace', async () => {
    server.use(
      http.post('/api/v3/auth/login', () => HttpResponse.json({
        access_token: 'a.eyJpYXQiOjAsImV4cCI6NDEwMjQ0NDgwMCwidXNlciI6ImFkbWluIn0.c',
        refresh_token: 'r.s.t',
        token_type: 'Bearer',
        expires_in: 3600,
      })),
    );
    const user = userEvent.setup();
    renderWithProviders(<ClassicLoginPage />);
    await user.type(screen.getByPlaceholderText('Username'), 'admin');
    await user.type(screen.getByPlaceholderText('Password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Login' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ href: '/', replace: true }));
  });

  it('shows the session-expired notice for ?reason=expired', () => {
    mockSearch.reason = 'expired';
    renderWithProviders(<ClassicLoginPage />);
    expect(screen.getByRole('status')).toHaveTextContent(/session has expired/i);
  });

  it('shows the backend message when sign-in fails', async () => {
    server.use(http.post('/api/v3/auth/login', () => HttpResponse.json({ message: 'Invalid username or password.' }, { status: 401 })));
    const user = userEvent.setup();
    renderWithProviders(<ClassicLoginPage />);
    await user.type(screen.getByPlaceholderText('Username'), 'admin');
    await user.type(screen.getByPlaceholderText('Password'), 'nope');
    await user.click(screen.getByRole('button', { name: 'Login' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/invalid username/i));
  });
});

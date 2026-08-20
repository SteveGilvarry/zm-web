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

const { default: UsersPage } = await import('./settings.users');

const server = setupServer();

beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test',
    refreshToken: 'test',
    user: { iat: 0, exp: 0, user: 'admin' },
    isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'warn' });
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

const base = {
  control: 'None', groups: 'None', devices: 'None', snapshots: 'None',
  phone: '', language: '', home_view: '', max_bandwidth: '', api_enabled: 1,
};

function seedUsers() {
  server.use(
    http.get('/api/v3/users', () => HttpResponse.json({
      items: [
        { ...base, id: 1, username: 'admin', name: 'Administrator', email: 'admin@example.com',
          stream: 'View', events: 'Edit', monitors: 'Create', system: 'Edit', enabled: 1 },
        { ...base, id: 2, username: 'viewer', name: 'Viewer', email: 'v@example.com',
          stream: 'View', events: 'View', monitors: 'View', system: 'None', enabled: 0 },
      ],
      total: 2, per_page: 25, current_page: 1, last_page: 1,
    })),
  );
}

describe('Users page', () => {
  it('lists users and tags the signed-in one', async () => {
    seedUsers();
    renderWithProviders(<UsersPage />);
    await waitFor(() => expect(screen.getByText('admin')).toBeInTheDocument());
    expect(screen.getByText('viewer')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByTitle('Cannot delete yourself')).toBeDisabled();
  });

  it('filters client-side by username, name or email', async () => {
    seedUsers();
    const user = userEvent.setup();
    renderWithProviders(<UsersPage />);
    await waitFor(() => expect(screen.getByText('admin')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText('Search users...'), 'v@example');
    expect(screen.queryByText('admin')).not.toBeInTheDocument();
    expect(screen.getByText('viewer')).toBeInTheDocument();
  });

  it('opens the editor on Add User with the Account form', async () => {
    seedUsers();
    const user = userEvent.setup();
    renderWithProviders(<UsersPage />);
    await waitFor(() => expect(screen.getByText('admin')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /add user/i }));
    await waitFor(() => expect(screen.getByText('Add User', { selector: 'h2, h3, h4, div, span' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /create user/i })).toBeDisabled();
  });
});

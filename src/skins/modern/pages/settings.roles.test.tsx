/** Settings → Roles (modern): the table and the editor over the same hooks as classic. */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { configListHandler } from '@/test/msw/handlers';
import { makeRole } from '@/test/fixtures/optionsAdmin';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/components/common/toastStore';

const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params, ...rest }: { children: ReactNode; to?: string; params?: Record<string, string>; search?: unknown }) => {
    delete rest.search;
    return <a href={(to ?? '#').replace('$roleId', params?.roleId ?? '')} {...rest}>{children}</a>;
  },
  useSearch: () => ({}),
  useNavigate: () => mockNavigate,
}));
vi.mock('@/skins/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const ALL_EDIT = {
  stream: 'Edit', events: 'Edit', control: 'Edit', monitors: 'Edit',
  groups: 'Edit', devices: 'Edit', snapshots: 'Edit', system: 'Edit',
};
const ADMIN = { iat: 0, exp: 4102444800, user: 'admin', uid: 1, perms: ALL_EDIT };
const VIEWER = { ...ADMIN, user: 'ops', uid: 2, perms: { ...ALL_EDIT, system: 'View' } };
const signIn = (user: unknown = ADMIN) =>
  useAuthStore.setState({ accessToken: 't', refreshToken: 't', isAuthenticated: true, user: user as never });

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  useToastStore.getState().clear();
  mockNavigate.mockClear();
});
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

const paged = <T,>(items: T[]) => ({ items, total: items.length, per_page: 1000, current_page: 1, last_page: 1 });
const ROLES = [makeRole({ id: 1, name: 'Operators', events: 'Edit' })];

let sent: unknown[] = [];
function seed() {
  sent = [];
  server.use(
    http.get('/api/v3/me', () => HttpResponse.json({}, { status: 404 })),
    configListHandler({}),
    http.get('/api/v3/roles', () => HttpResponse.json(paged(ROLES))),
    http.get('/api/v3/roles/:id', () => HttpResponse.json(ROLES[0])),
    http.get('/api/v3/users', () => HttpResponse.json(paged([{ id: 5, username: 'kim', name: 'Kim', email: '', enabled: 1, role_id: 1 }]))),
    http.put('/api/v3/roles/:id', async ({ request }) => {
      sent.push(await request.json());
      return HttpResponse.json(ROLES[0]);
    }),
    http.delete('/api/v3/roles/:id', ({ params }) => {
      sent.push(`DELETE ${params.id}`);
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

describe('modern Settings → Roles', () => {
  it('lists roles with level pills and user counts; deletes the marked ones', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    const { default: Page } = await import('./settings.roles');
    renderWithProviders(<Page />);
    const link = await screen.findByRole('link', { name: 'Operators' });
    expect(link).toHaveAttribute('href', '/settings/roles/1');
    const row = link.closest('tr')!;
    expect(within(row).getByText('Edit')).toBeInTheDocument();
    await waitFor(() => expect(within(row).getAllByRole('cell').at(-1)).toHaveTextContent('1'));

    await user.click(screen.getByRole('button', { name: 'Add Role' }));
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/settings/roles/$roleId', params: { roleId: '0' } });

    await user.click(within(row).getByRole('checkbox', { name: 'Mark Operators' }));
    await user.click(screen.getByRole('button', { name: 'Delete selected (1)' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(sent).toEqual(['DELETE 1']));
  });

  it('read-only for a System viewer', async () => {
    signIn(VIEWER);
    seed();
    const { default: Page } = await import('./settings.roles');
    renderWithProviders(<Page />);
    await screen.findByText('Operators');
    expect(screen.queryByRole('button', { name: 'Add Role' })).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('the editor saves changed levels and lists the role’s users', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    const { default: Page } = await import('./settings.roles.edit');
    renderWithProviders(<Page roleId={1} />);
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('Operators'));
    expect(await screen.findByRole('link', { name: 'kim' })).toBeInTheDocument();
    expect(screen.getByText(/Per-group and per-monitor permissions/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Control'), 'View');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent).toEqual([{ control: 'View' }]));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/settings/roles' }));
  });
});

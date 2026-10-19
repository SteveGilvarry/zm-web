/**
 * Options → Menu (classic): `_options_menu.php` — Enabled / Name / Custom
 * Label / Link / Icon, Save sends what changed, Add creates, Sort renumbers,
 * a saved row deletes after a confirm, Reset is unavailable.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { defaultMenu, makeMenuItem } from '@/test/fixtures/optionsAdmin';
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
const VIEWER = { ...ADMIN, user: 'ops', uid: 2, perms: { ...ALL_EDIT, system: 'View' } };
const signIn = (user: unknown = ADMIN) =>
  useAuthStore.setState({ accessToken: 't', refreshToken: 't', isAuthenticated: true, user: user as never });

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

const ITEMS = [
  ...defaultMenu().slice(0, 3), // Console 10, Watch 15, Montage 20
  makeMenuItem({ id: 20, menu_key: 'Wiki', sort_order: 30, link: 'https://wiki.example.com', icon: 'book' }),
];

let sent: Array<{ method: string; path: string; body: unknown }> = [];
function seed(items = ITEMS) {
  sent = [];
  server.use(
    http.get('/api/v3/me', () => HttpResponse.json({}, { status: 404 })),
    http.get('/api/v3/configs/categories', () => HttpResponse.json([])),
    http.get('/api/v3/configs', () => HttpResponse.json({ items: [], total: 0, per_page: 1000, current_page: 1, last_page: 1 })),
    http.get('/api/v3/menu-items', () => HttpResponse.json(items)),
    http.put('/api/v3/menu-items/:id', async ({ request, params }) => {
      sent.push({ method: 'PUT', path: `/menu-items/${params.id}`, body: await request.json() });
      return HttpResponse.json(items[0]);
    }),
    http.post('/api/v3/menu-items', async ({ request }) => {
      const body = await request.json();
      sent.push({ method: 'POST', path: '/menu-items', body });
      return HttpResponse.json({ ...makeMenuItem(), ...(body as object), id: 50 }, { status: 201 });
    }),
    http.delete('/api/v3/menu-items/:id', ({ params }) => {
      sent.push({ method: 'DELETE', path: `/menu-items/${params.id}`, body: null });
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

async function mount() {
  const { default: Page } = await import('./settings.menu');
  return renderWithProviders(<Page />);
}

const rows = () => screen.getAllByRole('row').slice(1);

describe('ClassicMenuPage', () => {
  it('renders legacy columns; built-ins show caption and route, custom rows their inputs', async () => {
    signIn();
    seed();
    await mount();
    await screen.findByText('Console');
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Enabled', 'Name', 'Custom Label', 'Link', 'Icon', 'Actions']);
    const [consoleRow, , , wiki] = rows();
    expect(within(consoleRow).getByText('/')).toBeInTheDocument();
    expect(within(consoleRow).getByLabelText('Custom Label for Console')).toHaveAttribute('placeholder', 'Console');
    expect(within(consoleRow).getByLabelText('Icon for Console')).toHaveAttribute('placeholder', 'dashboard');
    // Watch has no default icon: legacy falls back to "menu".
    expect(within(rows()[1]).getByLabelText('Icon for Watch')).toHaveAttribute('placeholder', 'menu');
    // A saved custom row keeps its key (zm-api cannot rename it) but its link is editable.
    expect(within(wiki).getByLabelText('Name')).toBeDisabled();
    expect(within(wiki).getByLabelText('Link for Wiki')).toHaveValue('https://wiki.example.com');
    expect(screen.getByRole('link', { name: 'Menu' })).toHaveAttribute('aria-current', 'page');
  });

  it('Save PUTs only the rows and fields that changed', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();
    await screen.findByText('Console');
    await user.click(screen.getByRole('checkbox', { name: 'Enable Montage' }));
    await user.type(screen.getByLabelText('Custom Label for Console'), 'Home');
    await user.selectOptions(screen.getByLabelText('Icon type for Watch'), 'none');
    expect(screen.queryByLabelText('Icon for Watch')).toBeNull();
    await user.clear(screen.getByLabelText('Link for Wiki'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent).toHaveLength(4));
    expect(sent).toEqual([
      { method: 'PUT', path: '/menu-items/1', body: { label: 'Home' } },
      { method: 'PUT', path: '/menu-items/2', body: { icon_type: 'none' } },
      { method: 'PUT', path: '/menu-items/3', body: { enabled: false } },
      { method: 'PUT', path: '/menu-items/20', body: { link: null } },
    ]);
  });

  it('Add appends an enabled row at the end; Save POSTs it, and a nameless one is refused', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();
    await screen.findByText('Console');
    await user.click(screen.getByRole('button', { name: /Add/ }));
    const added = rows().at(-1)!;
    const name = within(added).getByLabelText('Name');
    expect(name).toBeEnabled();
    expect(within(added).getByRole('checkbox')).toBeChecked();

    // The browser blocks the form on the required name; the hook refuses too.
    fireEvent.submit(name.closest('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('A new entry needs a name.');

    await user.type(name, 'Status');
    expect(within(added).getByLabelText('Link for Status')).toHaveAttribute('placeholder', '?view=Status');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({
      method: 'POST',
      path: '/menu-items',
      body: { menu_key: 'Status', enabled: true, label: null, link: null, icon: null, icon_type: 'material', sort_order: 50 },
    });
  });

  it('an unsaved row is removed without a request', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();
    await screen.findByText('Console');
    await user.click(screen.getByRole('button', { name: /Add/ }));
    expect(rows()).toHaveLength(5);
    await user.click(screen.getByRole('button', { name: 'Remove Name' }));
    expect(rows()).toHaveLength(4);
    expect(sent).toHaveLength(0);
  });

  it('Sort moves rows and renumbers every row by ten', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();
    await screen.findByText('Console');
    const sort = screen.getByRole('button', { name: /Sort/ });
    expect(screen.queryByRole('button', { name: 'Move Console up' })).toBeNull();
    await user.click(sort);
    expect(sort).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Move Console up' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Move Montage up' }));
    expect(rows().map((r) => within(r).getByRole('checkbox').getAttribute('aria-label')))
      .toEqual(['Enable Console', 'Enable Montage', 'Enable Watch', 'Enable Wiki']);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    // Console stays 10 and Montage lands on its old 20; Watch (15) and Wiki (30) move.
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent).toEqual([
      { method: 'PUT', path: '/menu-items/2', body: { sort_order: 30 } },
      { method: 'PUT', path: '/menu-items/20', body: { sort_order: 40 } },
    ]);
  });

  it('dragging a row onto another moves it there while sorting', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();
    await screen.findByText('Console');
    await user.click(screen.getByRole('button', { name: /Sort/ }));
    const [first, , , last] = rows();
    expect(last).toHaveAttribute('draggable', 'true');
    fireEvent.dragStart(last);
    fireEvent.dragOver(first);
    fireEvent.drop(first);
    expect(within(rows()[0]).getByLabelText('Link for Wiki')).toBeInTheDocument();
  });

  it('deleting a saved row confirms with legacy\'s question, then DELETEs', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();
    await user.click(await screen.findByRole('button', { name: 'Delete Watch' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Delete this menu entry?');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(sent).toEqual([{ method: 'DELETE', path: '/menu-items/2', body: null }]));
  });

  it('Reset is shown but disabled, with the reason on hover', async () => {
    signIn();
    seed();
    await mount();
    await screen.findByText('Console');
    const reset = screen.getByRole('button', { name: /Reset/ });
    expect(reset).toBeDisabled();
    expect(reset.parentElement).toHaveAttribute('title', 'Reset needs a zm-api endpoint that does not exist yet.');
  });

  it('a System viewer sees the table with nothing editable and no buttons', async () => {
    signIn(VIEWER);
    seed();
    await mount();
    await screen.findByText('Console');
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Enable Console' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Delete Watch' })).toBeNull();
  });
});

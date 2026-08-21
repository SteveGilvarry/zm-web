/**
 * Classic Options — the paths `settings.options.test.tsx` leaves out: the
 * in-category search, the "All" escape hatch, inline editing and its PUT,
 * the unsaved/Save-all flow, reset-to-default, the help toggle, the
 * read-only render and the backend-error state.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import type { UserClaims } from '@/types';

vi.mock('@/skins/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/skins/registry', () => ({
  skins: {
    modern: { id: 'modern', name: 'Mission Control', description: 'Dark cyan dashboard.', colorSchemes: ['light', 'dark'] },
    classic: { id: 'classic', name: 'Classic ZoneMinder', description: 'Legacy tables.', colorSchemes: ['light'] },
  },
  useSkin: () => ({ id: 'classic', name: 'Classic ZoneMinder', description: 'Legacy tables.', colorSchemes: ['light'] }),
}));

const mockSearch: { category?: string } = {};
const mockNavigate = vi.fn((opts: { search?: (prev: Record<string, unknown>) => Record<string, unknown> }) => {
  const next = opts.search?.({ ...mockSearch }) ?? {};
  delete mockSearch.category;
  if (typeof next.category === 'string') mockSearch.category = next.category;
});
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: ReactNode; to?: string; search?: unknown }) => {
    delete rest.search;
    return <a href={to ?? '#'} {...rest}>{children}</a>;
  },
  useSearch: () => ({ ...mockSearch }),
  useNavigate: () => mockNavigate,
}));

const VIEWER = {
  iat: 0, exp: 4102444800, user: 'viewer', uid: 2,
  perms: {
    stream: 'View', events: 'View', control: 'None', monitors: 'View',
    groups: 'View', devices: 'None', snapshots: 'None', system: 'View',
  },
} as unknown as UserClaims;

const CONFIGS = [
  {
    id: 1, name: 'ZM_OPT_USE_AUTH', value: '1', type: 'boolean', category: 'system',
    readonly: 0, private: 0, prompt: 'Authenticate user logins', default_value: 'yes',
    help: '  Turn this off only on a trusted network.  ',
  },
  {
    id: 2, name: 'ZM_AUTH_HASH_IPS', value: '0', type: 'boolean', category: 'system',
    readonly: 0, private: 0, prompt: 'Include IP in auth hash', default_value: 'yes',
  },
  {
    id: 3, name: 'ZM_DB_PASS', value: 'hunter2', type: 'string', category: 'system',
    readonly: 1, private: 1, prompt: 'Database password', default_value: '',
  },
];

const server = setupServer();
const puts: Array<{ name: string; body: unknown }> = [];

function seed(configs: unknown[] = CONFIGS) {
  server.use(
    http.get('/api/v3/system/status', () => HttpResponse.json({ running: true, daemons: [] })),
    http.get('/api/v3/host/getVersion', () =>
      HttpResponse.json({ version: '1.37.0', api_version: '3.0', db_version: '1.37.0' })),
    http.get('/api/v3/daemons', () => HttpResponse.json({ daemons: [] })),
    http.get('/api/v3/configs/:name', ({ params }) => HttpResponse.json({
      id: 0, name: params.name, value: '', type: 'boolean',
      category: 'x10', readonly: 0, private: 0, system: 0,
    })),
    http.get('/api/v3/configs', () => HttpResponse.json({
      items: configs, total: configs.length, per_page: 500, current_page: 1, last_page: 1,
    })),
    http.put('/api/v3/configs/:name', async ({ params, request }) => {
      const body = await request.json();
      puts.push({ name: String(params.name), body });
      return HttpResponse.json({ ...CONFIGS[0], name: params.name, ...(body as object) });
    }),
  );
}

beforeAll(() => { server.listen({ onUnhandledRequest: 'error' }); });
beforeEach(() => {
  useAuthStore.setState({
    accessToken: 't', refreshToken: 't', isAuthenticated: true,
    user: { iat: 0, exp: 4102444800, user: 'admin', uid: 1 } as unknown as UserClaims,
  });
  mockSearch.category = 'system';
});
afterEach(() => {
  server.resetHandlers();
  puts.length = 0;
  delete mockSearch.category;
  mockNavigate.mockClear();
  vi.restoreAllMocks();
});
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

async function mount() {
  const { default: Page } = await import('./settings.options');
  return renderWithProviders(<Page />);
}

describe('ClassicSettingsOptionsPage — extra paths', () => {
  it('narrows the table with the in-category search and counts the matches', async () => {
    seed();
    const user = userEvent.setup();
    await mount();
    await screen.findByText('ZM_OPT_USE_AUTH');
    expect(screen.getByText('3 configs')).toBeInTheDocument();

    const box = screen.getByPlaceholderText('Search in system...');
    await user.type(box, 'HASH');

    await waitFor(() => expect(screen.queryByText('ZM_OPT_USE_AUTH')).toBeNull());
    expect(screen.getByText('ZM_AUTH_HASH_IPS')).toBeInTheDocument();
    expect(screen.getByText('1 config')).toBeInTheDocument();
  });

  it('says so when nothing matches the search', async () => {
    seed();
    const user = userEvent.setup();
    await mount();
    await screen.findByText('ZM_OPT_USE_AUTH');

    await user.type(screen.getByPlaceholderText('Search in system...'), 'zzz-no-such-config');
    expect(await screen.findByText('No configs match your search')).toBeInTheDocument();
  });

  it('drops the category filter from the URL through the All button', async () => {
    seed();
    const user = userEvent.setup();
    await mount();
    await screen.findByText('ZM_OPT_USE_AUTH');

    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(mockSearch.category).toBeUndefined();
  });

  it('edits a boolean value inline and PUTs it', async () => {
    seed();
    const user = userEvent.setup();
    await mount();
    await screen.findByText('ZM_OPT_USE_AUTH');

    // The value cell is click-to-edit.
    await user.click(screen.getAllByTitle('1')[0]);
    const box = await screen.findByRole('checkbox');
    expect(box).toBeChecked();
    await user.click(box);
    await user.click(screen.getAllByRole('button', { name: 'Save' })[0]);

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({ name: 'ZM_OPT_USE_AUTH', body: { value: '0' } });
  });

  it('abandons an inline edit on Cancel', async () => {
    seed();
    const user = userEvent.setup();
    await mount();
    await screen.findByText('ZM_OPT_USE_AUTH');

    await user.click(screen.getAllByTitle('1')[0]);
    await screen.findByRole('checkbox');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('checkbox')).toBeNull());
    expect(puts).toEqual([]);
  });

  it('toggles the per-row help text', async () => {
    seed();
    const user = userEvent.setup();
    await mount();
    await screen.findByText('ZM_OPT_USE_AUTH');

    const help = screen.getByRole('button', { name: 'Show help' });
    expect(help).toHaveAttribute('aria-expanded', 'false');
    await user.click(help);

    expect(screen.getByText('Turn this off only on a trusted network.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hide help' }));
    expect(screen.queryByText('Turn this off only on a trusted network.')).toBeNull();
  });

  it('offers reset-to-default only for a row that has drifted', async () => {
    seed();
    await mount();
    await screen.findByText('ZM_OPT_USE_AUTH');

    // ZM_OPT_USE_AUTH is '1' with default 'yes' — already at its default.
    expect(screen.queryByRole('button', { name: 'Reset ZM_OPT_USE_AUTH to default' })).toBeNull();
    // ZM_AUTH_HASH_IPS is '0' with default 'yes' — drifted, so it can be reset.
    expect(screen.getByRole('button', { name: 'Reset ZM_AUTH_HASH_IPS to default' })).toBeInTheDocument();
  });

  it('masks a private config and marks a read-only row', async () => {
    seed();
    await mount();

    const secret = (await screen.findByText('ZM_DB_PASS')).closest('tr')!;
    expect(within(secret).getByText('(read-only)')).toBeInTheDocument();
    expect(within(secret).getByText('••••••••')).toBeInTheDocument();
    expect(secret.textContent).not.toContain('hunter2');
  });

  it('renders every row read-only for a user without system:Edit', async () => {
    useAuthStore.setState({ user: VIEWER });
    seed();
    await mount();

    await screen.findByText('ZM_OPT_USE_AUTH');
    expect(screen.getAllByText('(read-only)')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /^Save/ })).toBeNull();
  });

  // Documented, not endorsed: when /configs fails the category list is empty,
  // so `selectedCategory` falls back to null and the page shows the Display
  // tab's skin chooser. The QueryState error branch never renders.
  it('falls back to the Display tab when the config fetch fails', async () => {
    server.use(
      http.get('/api/v3/system/status', () => HttpResponse.json({ running: false, daemons: [] })),
      http.get('/api/v3/host/getVersion', () => HttpResponse.json({ version: '1.37.0', api_version: '3.0' })),
      http.get('/api/v3/daemons', () => HttpResponse.json({ daemons: [] })),
      http.get('/api/v3/configs/:name', ({ params }) =>
        HttpResponse.json({ id: 0, name: params.name, value: '', type: 'boolean', category: 'x10', readonly: 0, private: 0, system: 0 })),
      http.get('/api/v3/configs', () =>
        HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'Config table locked' }, { status: 500 })),
    );
    await mount();

    expect(await screen.findByText('Stopped')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('does the same when the backend is unreachable', async () => {
    server.use(
      http.get('/api/v3/system/status', () => HttpResponse.json({ running: true, daemons: [] })),
      http.get('/api/v3/host/getVersion', () => HttpResponse.json({ version: '1.37.0', api_version: '3.0' })),
      http.get('/api/v3/daemons', () => HttpResponse.json({ daemons: [] })),
      http.get('/api/v3/configs/:name', ({ params }) =>
        HttpResponse.json({ id: 0, name: params.name, value: '', type: 'boolean', category: 'x10', readonly: 0, private: 0, system: 0 })),
      http.get('/api/v3/configs', () => HttpResponse.error()),
    );
    await mount();

    expect(await screen.findByText('Classic ZoneMinder')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('lists the version table under the Version tab', async () => {
    mockSearch.category = 'version';
    seed([{
      id: 9, name: 'ZM_DYN_DB_VERSION', value: '1.37.0', type: 'string', category: 'version',
      readonly: 1, private: 0, prompt: 'Database schema version', default_value: null,
    }]);
    await mount();

    const table = await screen.findByRole('table', { name: 'Versions' });
    expect(within(table).getByRole('rowheader', { name: 'ZoneMinder version' })).toBeInTheDocument();
    expect(within(table).getByRole('rowheader', { name: 'API version' })).toBeInTheDocument();
    expect(within(table).getByRole('rowheader', { name: 'Database version' })).toBeInTheDocument();
    expect(within(table).getAllByText('1.37.0')).toHaveLength(2);
    expect(within(table).getByText('3.0')).toBeInTheDocument();
  });
});

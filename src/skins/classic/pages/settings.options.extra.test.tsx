/**
 * Classic Options — the legacy form: every option drawn in place, one
 * Save per tab, radios for a short choice, the "(?)" help, masked and
 * read-only rows, the viewer render and the backend-error state.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw/http';
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
    modern: { id: 'modern', name: 'Modern', description: 'A live wall and dense tables.', colorSchemes: ['light', 'dark'] },
    classic: { id: 'classic', name: 'Classic ZoneMinder', description: 'Legacy tables.', colorSchemes: ['light'] },
  },
  skinIds: ['modern', 'classic'],
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

beforeAll(() => { server.listen({ onUnhandledFrame: 'error' }); });
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
  it('draws every option in place, labelled without ZM_, prompt underneath', async () => {
    seed();
    await mount();

    const auth = await screen.findByLabelText('OPT_USE_AUTH');
    expect(auth).toHaveAttribute('type', 'checkbox');
    expect(auth).toBeChecked();
    expect(screen.getByLabelText('AUTH_HASH_IPS')).not.toBeChecked();
    expect(screen.queryByText('ZM_OPT_USE_AUTH')).toBeNull();
    expect(screen.getByText('Authenticate user logins')).toBeInTheDocument();
    // No search, no paging: legacy draws the whole tab.
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('saves every edited row of the tab with the one Save at the top', async () => {
    seed();
    const user = userEvent.setup();
    await mount();

    await user.click(await screen.findByLabelText('OPT_USE_AUTH'));
    await user.click(screen.getByLabelText('AUTH_HASH_IPS'));
    expect(screen.getByText(/^2 unsaved change/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Save' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(puts).toHaveLength(2));
    expect(puts).toEqual([
      { name: 'ZM_OPT_USE_AUTH', body: { value: '0' } },
      { name: 'ZM_AUTH_HASH_IPS', body: { value: '1' } },
    ]);
  });

  it('forgets a row typed back to its stored value', async () => {
    seed();
    const user = userEvent.setup();
    await mount();

    const box = await screen.findByLabelText('OPT_USE_AUTH');
    await user.click(box);
    expect(screen.getByText(/^1 unsaved change/)).toBeInTheDocument();
    await user.click(box);
    expect(screen.queryByText(/unsaved change/)).toBeNull();
  });

  it('asks before leaving a tab with unsaved rows, and stays when told to', async () => {
    seed();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    await mount();

    await user.click(await screen.findByLabelText('OPT_USE_AUTH'));
    const rail = screen.getByRole('navigation', { name: 'Options' });
    await user.click(within(rail).getByRole('button', { name: 'This Session' }));

    expect(confirm).toHaveBeenCalledWith('Discard 1 unsaved change?');
    expect(mockSearch.category).toBe('system');
    expect(screen.getByLabelText('OPT_USE_AUTH')).not.toBeChecked();
  });

  it('draws radios for a choice of three or fewer and a select above that', async () => {
    seed([
      { id: 4, name: 'ZM_AUTH_TYPE', value: 'builtin', type: 'string', category: 'system', readonly: 0, private: 0, hint: 'builtin|remote', prompt: 'What is used to authenticate' },
      { id: 5, name: 'ZM_LOG_LEVEL', value: 'info', type: 'string', category: 'system', readonly: 0, private: 0, hint: 'debug|info|warning|error', prompt: 'Log level' },
    ]);
    const user = userEvent.setup();
    await mount();

    const group = await screen.findByRole('radiogroup');
    expect(within(group).getByRole('radio', { name: 'builtin' })).toBeChecked();
    await user.click(within(group).getByRole('radio', { name: 'remote' }));
    expect(within(group).getByRole('radio', { name: 'remote' })).toBeChecked();
    expect(screen.getByLabelText('LOG_LEVEL').tagName).toBe('SELECT');
  });

  it('opens the help text from the "(?)" link', async () => {
    seed();
    const user = userEvent.setup();
    await mount();

    await user.click(await screen.findByRole('button', { name: 'Help for ZM_OPT_USE_AUTH' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Turn this off only on a trusted network.')).toBeInTheDocument();
  });

  it('masks a private option and disables a read-only one', async () => {
    seed();
    await mount();

    const secret = await screen.findByLabelText('DB_PASS');
    expect(secret).toHaveAttribute('type', 'password');
    expect(secret).toHaveAttribute('autocomplete', 'new-password');
    expect(secret).toBeDisabled();
  });

  it('disables a System row as legacy does', async () => {
    seed([{ id: 6, name: 'ZM_PATH_FFMPEG', value: '/usr/bin/ffmpeg', type: 'string', category: 'system', readonly: 0, private: 0, system: 1, prompt: 'Path to ffmpeg' }]);
    await mount();

    expect(await screen.findByLabelText('PATH_FFMPEG')).toBeDisabled();
  });

  it('disables every input and Save for a user without system:Edit, and withholds private values', async () => {
    useAuthStore.setState({ user: VIEWER });
    seed([
      ...CONFIGS,
      { id: 7, name: 'ZM_AUTH_HASH_SECRET', value: 'abc123', type: 'string', category: 'system', readonly: 0, private: 1, prompt: 'Secret for encoding hashed authentication information' },
    ]);
    await mount();

    expect(await screen.findByLabelText('OPT_USE_AUTH')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByLabelText('AUTH_HASH_SECRET')).toHaveValue('');
    expect(screen.getAllByText('This value is private and is shown only to users who can edit System settings.')).toHaveLength(2);
  });

  it('opens on System when no tab is asked for', async () => {
    delete mockSearch.category;
    seed();
    await mount();

    expect(await screen.findByLabelText('OPT_USE_AUTH')).toBeInTheDocument();
    const rail = screen.getByRole('navigation', { name: 'Options' });
    expect(within(rail).getByRole('button', { name: 'System' })).toHaveAttribute('aria-current', 'page');
  });

  it('reports a failed config fetch instead of hiding it', async () => {
    delete mockSearch.category;
    server.use(
      http.get('/api/v3/system/status', () => HttpResponse.json({ running: false, daemons: [] })),
      http.get('/api/v3/host/getVersion', () => HttpResponse.json({ version: '1.37.0', api_version: '3.0' })),
      http.get('/api/v3/daemons', () => HttpResponse.json({ daemons: [] })),
      http.get('/api/v3/configs/:name', ({ params }) =>
        HttpResponse.json({ id: 0, name: params.name, value: '', type: 'boolean', category: 'x10', readonly: 0, private: 0, system: 0 })),
      http.get('/api/v3/configs', () => HttpResponse.error()),
    );
    await mount();

    expect(await screen.findByText('Cannot reach the server.')).toBeInTheDocument();
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
    expect(screen.getByLabelText('DYN_DB_VERSION')).toHaveValue('1.37.0');
  });
});

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

// The selected category lives in `?category=`; stand in for the router with
// a tiny in-memory search object so the hook's navigate() is observable.
const mockSearch: { category?: string } = {};
const mockNavigate = vi.fn((opts: { search?: (prev: Record<string, unknown>) => Record<string, unknown> }) => {
  const next = opts.search?.({ ...mockSearch }) ?? {};
  delete mockSearch.category;
  if (typeof next.category === 'string') mockSearch.category = next.category;
});
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to?: string }) => (
    <a href={to ?? '#'} {...rest}>{children}</a>
  ),
  useSearch: () => ({ ...mockSearch }),
  useNavigate: () => mockNavigate,
}));

// The Appearance chooser reads the skin registry, which pulls in every
// skin's chrome. Stub it; the switcher's own behaviour is not under test here.
vi.mock('@/skins/registry', () => ({
  skins: {
    modern: { id: 'modern', name: 'Modern', description: 'A live wall and dense tables.', colorSchemes: ['light', 'dark'] },
    classic: { id: 'classic', name: 'Classic ZoneMinder', description: 'Legacy tables.', colorSchemes: ['light'] },
  },
  useSkin: () => ({ id: 'modern', name: 'Modern', description: 'A live wall and dense tables.', colorSchemes: ['light', 'dark'] }),
}));

const { default: SettingsOptionsPage } = await import('./settings.options');

const server = setupServer();

beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', user: { iat: 0, exp: 4102444800, user: 'admin', uid: 1 }, isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'warn' });
});
afterEach(() => {
  server.resetHandlers();
  delete mockSearch.category;
});
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

const CONFIGS = [
  { id: 1, name: 'ZM_OPT_USE_AUTH', value: '1', type: 'boolean', category: 'system', readonly: 0, help: 'Use auth', hint: '', prompt: 'Authenticate user logins to ZoneMinder', default_value: 'yes', pattern: '(?^i:^([yn]))' },
  { id: 2, name: 'ZM_WEB_TITLE', value: 'ZoneMinder', type: 'string', category: 'web', readonly: 0, help: '', hint: '', prompt: 'The title displayed wherever the site references itself', default_value: 'ZoneMinder' },
  { id: 3, name: 'ZM_WEB_EVENTS_PER_PAGE', value: '30', type: 'integer', category: 'web', readonly: 0, help: '', hint: 'integer', prompt: 'How many events to list per page in paged mode', default_value: '25', pattern: '(?^:^(\\d+)$)' },
  { id: 4, name: 'ZM_WEB_H_REFRESH_MAIN', value: '60', type: 'integer', category: 'highband', readonly: 0, help: '', hint: '' },
  { id: 5, name: 'ZM_DYN_LAST_VERSION', value: '1.37', type: 'string', category: 'dynamic', readonly: 1, help: '', hint: '' },
  { id: 6, name: 'ZM_X10_HOUSE_CODE', value: 'A', type: 'string', category: 'x10', readonly: 0, help: '', hint: '' },
];

function setupHappyPath(x10 = '0') {
  server.use(
    http.get('/api/v3/configs/:name', ({ params }) => HttpResponse.json(
      params.name === 'ZM_OPT_X10'
        ? { id: 100, name: 'ZM_OPT_X10', value: x10, type: 'boolean', category: 'x10', readonly: 0, private: 0, system: 0 }
        : { id: 0, name: params.name, value: '', type: 'string', category: 'system', readonly: 0, private: 0, system: 0 },
    )),
    http.get('/api/v3/system/status', () => HttpResponse.json({
      running: true,
      daemons: [],
      stats: {
        cpu_load: 0.42, cpu_usage_percent: 12.5,
        total_mem: 8 * 1024 ** 3, free_mem: 4 * 1024 ** 3, total_swap: 0, free_swap: 0,
        total_disk: 100 * 1024 ** 3, used_disk: 95 * 1024 ** 3, free_disk: 5 * 1024 ** 3,
        disk_usage_percent: 95,
      },
    })),
    http.get('/api/v3/host/getVersion', () => HttpResponse.json({ version: '1.37.0', api_version: '3.0' })),
    http.get('/api/v3/daemons', () => HttpResponse.json({ daemons: [] })),
    // Two callers share this endpoint: the page lists the rows it renders,
    // and `useZmConfig` reads the whole table in one go (`page_size=1000`)
    // instead of one request per setting. Only the latter needs the gate
    // row — adding it to the page's list would change the category counts.
    http.get('/api/v3/configs', ({ request }) => {
      const wholeTable = new URL(request.url).searchParams.get('page_size') === '1000';
      const items = wholeTable
        ? [...CONFIGS, { id: 100, name: 'ZM_OPT_X10', value: x10, type: 'boolean', category: 'x10', readonly: 0, help: '', hint: '' }]
        : CONFIGS;
      return HttpResponse.json({ items, total: items.length, per_page: 500, current_page: 1, last_page: 1 });
    }),
  );
}

describe('Settings → Options page', () => {
  it('renders version, running badge and categories from the API', async () => {
    setupHappyPath();
    renderWithProviders(<SettingsOptionsPage />);
    await waitFor(() => expect(screen.getByText('1.37.0')).toBeInTheDocument());
    expect(screen.getByText('Running')).toBeInTheDocument();
    // categories are humanised in the sidebar
    expect(screen.getByRole('button', { name: /System\s*1/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Web\s*2/ })).toBeInTheDocument();
    // both configs listed under "All"
    expect(screen.getByText('ZM_OPT_USE_AUTH')).toBeInTheDocument();
    expect(screen.getByText('ZM_WEB_TITLE')).toBeInTheDocument();
    expect(screen.getByText('enabled')).toBeInTheDocument();
    // prompt rendered under the name
    expect(screen.getByText('Authenticate user logins to ZoneMinder')).toBeInTheDocument();
  });

  it('hides bandwidth/dynamic categories and their rows, and x10 until ZM_OPT_X10 is on', async () => {
    setupHappyPath('0');
    renderWithProviders(<SettingsOptionsPage />);
    await waitFor(() => expect(screen.getByText('ZM_WEB_TITLE')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Highband/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Dynamic/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /X10/ })).not.toBeInTheDocument();
    expect(screen.queryByText('ZM_WEB_H_REFRESH_MAIN')).not.toBeInTheDocument();
    expect(screen.queryByText('ZM_X10_HOUSE_CODE')).not.toBeInTheDocument();
  });

  it('shows the x10 category once ZM_OPT_X10 is on', async () => {
    setupHappyPath('1');
    renderWithProviders(<SettingsOptionsPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /X10\s*1/ })).toBeInTheDocument());
    expect(screen.getByText('ZM_X10_HOUSE_CODE')).toBeInTheDocument();
  });

  it('honours ?category= from the URL and writes it back on selection', async () => {
    setupHappyPath();
    mockSearch.category = 'web';
    const user = userEvent.setup();
    renderWithProviders(<SettingsOptionsPage />);
    await waitFor(() => expect(screen.getByText('ZM_WEB_TITLE')).toBeInTheDocument());
    expect(screen.queryByText('ZM_OPT_USE_AUTH')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /System\s*1/ }));
    expect(mockNavigate).toHaveBeenCalled();
    expect(mockSearch.category).toBe('system');
  });

  it('resets a row to its default with one PUT', async () => {
    setupHappyPath();
    let body: unknown = null;
    server.use(
      http.put('/api/v3/configs/ZM_WEB_EVENTS_PER_PAGE', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ...CONFIGS[2], value: '25' });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<SettingsOptionsPage />);
    await waitFor(() => expect(screen.getByText('ZM_WEB_EVENTS_PER_PAGE')).toBeInTheDocument());
    // ZM_WEB_TITLE is at its default, so it has no reset control.
    expect(screen.queryByRole('button', { name: /reset ZM_WEB_TITLE/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /reset ZM_WEB_EVENTS_PER_PAGE/i }));
    await waitFor(() => expect(body).toEqual({ value: '25' }));
  });

  it('blocks Save while the value fails the row pattern', async () => {
    setupHappyPath();
    let puts = 0;
    server.use(http.put('/api/v3/configs/:name', () => { puts += 1; return HttpResponse.json(CONFIGS[2]); }));
    const user = userEvent.setup();
    renderWithProviders(<SettingsOptionsPage />);
    await waitFor(() => expect(screen.getByText('ZM_WEB_EVENTS_PER_PAGE')).toBeInTheDocument());
    await user.click(screen.getByText('30'));
    const input = screen.getByRole('spinbutton');
    await user.clear(input);
    await user.type(input, '-5');
    expect(await screen.findByRole('alert')).toHaveTextContent(/pattern/);
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled();
    await user.keyboard('{Enter}');
    expect(puts).toBe(0);
  });

  it('selecting a category narrows the table and resets search', async () => {
    setupHappyPath();
    const user = userEvent.setup();
    renderWithProviders(<SettingsOptionsPage />);
    await waitFor(() => expect(screen.getByText('ZM_WEB_TITLE')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText('Search all configs...'), 'TITLE');
    expect(screen.queryByText('ZM_OPT_USE_AUTH')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /System\s*1/ }));
    expect(screen.getByPlaceholderText('Search in system...')).toHaveValue('');
    expect(screen.getByText('ZM_OPT_USE_AUTH')).toBeInTheDocument();
    expect(screen.queryByText('ZM_WEB_TITLE')).not.toBeInTheDocument();
  });

  it('Stop ZoneMinder confirms then POSTs /system/shutdown', async () => {
    setupHappyPath();
    let hits = 0;
    server.use(
      http.post('/api/v3/system/shutdown', () => {
        hits += 1;
        return HttpResponse.json({ success: true });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<SettingsOptionsPage />);
    await waitFor(() => expect(screen.getByText('1.37.0')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /stop zoneminder/i }));
    await waitFor(() => expect(screen.getByText(/All monitoring will cease/)).toBeInTheDocument());
    expect(hits).toBe(0);
    await user.click(screen.getByRole('button', { name: /^stop$/i }));
    await waitFor(() => expect(hits).toBe(1));
  });
});

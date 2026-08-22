import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';

vi.mock('@/skins/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/skins/registry', () => ({
  skins: {
    modern: { id: 'modern', name: 'Modern', description: 'A live wall and dense tables.', colorSchemes: ['light', 'dark'] },
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
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to?: string; search?: unknown }) => {
    delete rest.search; // router-only prop; not a DOM attribute
    return <a href={to ?? '#'} {...rest}>{children}</a>;
  },
  useSearch: () => ({ ...mockSearch }),
  useNavigate: () => mockNavigate,
}));

const { default: ClassicOptionsPage } = await import('./settings.options');

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({ accessToken: 'test', refreshToken: 'test', user: { iat: 0, exp: 4102444800, user: 'admin', uid: 1 }, isAuthenticated: true });
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
  { id: 1, name: 'ZM_OPT_USE_AUTH', value: '1', type: 'boolean', category: 'system', readonly: 0, prompt: 'Authenticate user logins', default_value: 'yes' },
  { id: 2, name: 'ZM_WEB_TITLE', value: 'ZoneMinder', type: 'string', category: 'web', readonly: 0, prompt: 'Site title', default_value: 'ZoneMinder' },
  { id: 3, name: 'ZM_WEB_H_REFRESH_MAIN', value: '60', type: 'integer', category: 'highband', readonly: 0 },
  { id: 4, name: 'ZM_MQTT_ENABLED', value: '0', type: 'boolean', category: 'MQTT', readonly: 0, prompt: 'Enable MQTT' },
  { id: 5, name: 'ZM_X10_HOUSE_CODE', value: 'A', type: 'string', category: 'x10', readonly: 0 },
];

function seed(x10 = '0') {
  server.use(
    http.get('/api/v3/system/status', () => HttpResponse.json({ running: true, daemons: [] })),
    http.get('/api/v3/host/getVersion', () => HttpResponse.json({ version: '1.37.0', api_version: '3.0' })),
    http.get('/api/v3/daemons', () => HttpResponse.json({ daemons: [] })),
    http.get('/api/v3/configs/:name', ({ params }) => HttpResponse.json({
      id: 0, name: params.name, value: params.name === 'ZM_OPT_X10' ? x10 : '', type: 'boolean', category: 'x10', readonly: 0, private: 0, system: 0,
    })),
    http.get('/api/v3/configs', () => HttpResponse.json({
      items: CONFIGS, total: CONFIGS.length, per_page: 500, current_page: 1, last_page: 1,
    })),
  );
}

describe('Classic Options page', () => {
  it('renders the legacy tab rail without bandwidth tabs and with the sub-pages', async () => {
    seed();
    // The page opens on Display (skin chooser) like legacy; pick a category
    // so the config table is what gets asserted.
    mockSearch.category = 'system';
    renderWithProviders(<ClassicOptionsPage />);
    await waitFor(() => expect(screen.getByText('Authenticate user logins')).toBeInTheDocument());
    const rail = screen.getByRole('navigation', { name: 'Options' });
    const labels = within(rail).getAllByRole('listitem').map((li) => li.textContent);
    expect(labels).toEqual(['Display', 'System', 'Servers', 'Storage', 'Web', 'Control', 'MQTT', 'Users', 'Groups', 'Run State']);
    expect(within(rail).getByRole('link', { name: 'Users' })).toHaveAttribute('href', '/settings/users');
    expect(within(rail).getByRole('link', { name: 'Groups' })).toHaveAttribute('href', '/groups');
    // bandwidth rows never show, even under "All"
    expect(screen.queryByText('ZM_WEB_H_REFRESH_MAIN')).not.toBeInTheDocument();
    // prompt is the Description column
    expect(screen.getByText('Authenticate user logins')).toBeInTheDocument();
  });

  it('adds the X10 tab when ZM_OPT_X10 is on', async () => {
    seed('1');
    renderWithProviders(<ClassicOptionsPage />);
    const rail = screen.getByRole('navigation', { name: 'Options' });
    await waitFor(() => expect(within(rail).getByRole('button', { name: 'X10' })).toBeInTheDocument());
  });

  it('category tabs switch in place and write ?category=', async () => {
    seed();
    const user = userEvent.setup();
    mockSearch.category = 'web';
    renderWithProviders(<ClassicOptionsPage />);
    await waitFor(() => expect(screen.getByText('ZM_WEB_TITLE')).toBeInTheDocument());
    const rail = screen.getByRole('navigation', { name: 'Options' });
    await user.click(within(rail).getByRole('button', { name: 'MQTT' }));
    expect(mockSearch.category).toBe('MQTT');
  });

  it('?category=display shows the skin chooser instead of the table', async () => {
    seed();
    mockSearch.category = 'display';
    renderWithProviders(<ClassicOptionsPage />);
    await waitFor(() => expect(screen.getByText('Classic ZoneMinder')).toBeInTheDocument());
    expect(screen.queryByText('ZM_WEB_TITLE')).not.toBeInTheDocument();
  });
});

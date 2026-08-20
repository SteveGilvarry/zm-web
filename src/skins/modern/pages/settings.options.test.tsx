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

// The Appearance chooser reads the skin registry, which pulls in every
// skin's chrome. Stub it; the switcher's own behaviour is not under test here.
vi.mock('@/skins/registry', () => ({
  skins: {
    modern: { id: 'modern', name: 'Mission Control', description: 'Dark cyan dashboard.' },
    classic: { id: 'classic', name: 'Classic ZoneMinder', description: 'Legacy tables.' },
  },
  useSkin: () => ({ id: 'modern' }),
}));

const { default: SettingsOptionsPage } = await import('./settings.options');

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

function setupHappyPath() {
  server.use(
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
    http.get('/api/v3/configs', () => HttpResponse.json({
      items: [
        { id: 1, name: 'ZM_OPT_USE_AUTH', value: '1', type: 'boolean', category: 'system', readonly: 0, help: 'Use auth', hint: '' },
        { id: 2, name: 'ZM_WEB_TITLE', value: 'ZoneMinder', type: 'string', category: 'web', readonly: 0, help: '', hint: '' },
      ],
      total: 2, per_page: 500, current_page: 1, last_page: 1,
    })),
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
    expect(screen.getByRole('button', { name: /Web\s*1/ })).toBeInTheDocument();
    // both configs listed under "All"
    expect(screen.getByText('ZM_OPT_USE_AUTH')).toBeInTheDocument();
    expect(screen.getByText('ZM_WEB_TITLE')).toBeInTheDocument();
    expect(screen.getByText('enabled')).toBeInTheDocument();
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

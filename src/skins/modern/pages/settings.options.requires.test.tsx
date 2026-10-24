/**
 * Modern Options: `Requires` locks dependents while the controlling
 * option is being edited, and a conf-file row is read-only.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw/http';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';

vi.mock('@/skins/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
const mockSearch: { category?: string } = { category: 'auth' };
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to?: string }) => <a href={to ?? '#'}>{children}</a>,
  useSearch: () => ({ ...mockSearch }),
  useNavigate: () => vi.fn(),
}));
vi.mock('@/skins/registry', () => ({
  skins: { modern: { id: 'modern', name: 'Modern', description: '', colorSchemes: ['light', 'dark'] } },
  useSkin: () => ({ id: 'modern', name: 'Modern', description: '', colorSchemes: ['light', 'dark'] }),
}));

const { default: SettingsOptionsPage } = await import('./settings.options');

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({ accessToken: 'test', refreshToken: 'test', user: { iat: 0, exp: 4102444800, user: 'admin', uid: 1 }, isAuthenticated: true });
  server.listen({ onUnhandledFrame: 'warn' });
});
afterEach(() => { server.resetHandlers(); });
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

const row = (id: number, name: string, value: string, type: string, extra: Record<string, unknown> = {}) => ({
  id, name, value, type, category: 'auth', readonly: 0, private: 0, system: 0, source: 'db', prompt: `${name} prompt`, help: '', hint: '', ...extra,
});
const CONFIGS = [
  row(1, 'ZM_OPT_USE_AUTH', '1', 'boolean'),
  row(2, 'ZM_AUTH_HASH_TTL', '2', 'integer', { requires: 'ZM_OPT_USE_AUTH=1' }),
  row(3, 'ZM_PATH_FFMPEG', '/usr/bin/ffmpeg', 'string', {
    system: 1, source: 'file', source_file: '/etc/zm/conf.d/01-system-paths.conf',
  }),
];

function seed() {
  server.use(
    http.get('/api/v3/system/status', () => HttpResponse.json({ running: true, daemons: [] })),
    http.get('/api/v3/host/getVersion', () => HttpResponse.json({ version: '1.39.41', api_version: '3.0' })),
    http.get('/api/v3/daemons', () => HttpResponse.json({ daemons: [] })),
    http.get('/api/v3/configs', () =>
      HttpResponse.json({ items: CONFIGS, total: CONFIGS.length, per_page: 500, current_page: 1, last_page: 1 })),
  );
}

const rowOf = (name: string) => screen.getByText(name).closest('tr')!;

describe('Modern Options — locks', () => {
  it('locks a dependent while its controlling option is switched off in the editor', async () => {
    const user = userEvent.setup();
    seed();
    renderWithProviders(<SettingsOptionsPage />);
    await screen.findByText('ZM_AUTH_HASH_TTL');
    expect(within(rowOf('ZM_AUTH_HASH_TTL')).queryByTestId('config-lock-note')).toBeNull();

    await user.click(within(rowOf('ZM_OPT_USE_AUTH')).getByText('enabled'));
    await user.click(within(rowOf('ZM_OPT_USE_AUTH')).getByRole('checkbox'));
    expect(within(rowOf('ZM_AUTH_HASH_TTL')).getByTestId('config-lock-note')).toHaveTextContent('Needs ZM_OPT_USE_AUTH=1');
  });

  it('names the conf file that sets a row', async () => {
    seed();
    renderWithProviders(<SettingsOptionsPage />);
    await screen.findByText('ZM_PATH_FFMPEG');
    expect(within(rowOf('ZM_PATH_FFMPEG')).getByTestId('config-lock-note'))
      .toHaveTextContent('Set by the system owner in /etc/zm/conf.d/01-system-paths.conf.');
  });
});

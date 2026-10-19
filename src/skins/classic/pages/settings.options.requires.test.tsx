/**
 * Classic Options: rows set in a conf file, and rows whose `Requires` is
 * not met (`options.php:264-311` and the page script at 391-430).
 */
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
vi.mock('@/skins/registry', () => ({
  skins: { classic: { id: 'classic', name: 'Classic ZoneMinder', description: '', colorSchemes: ['light'] } },
  skinIds: ['classic'],
  useSkin: () => ({ id: 'classic', name: 'Classic ZoneMinder', description: '', colorSchemes: ['light'] }),
}));
const mockSearch: { category?: string } = { category: 'auth' };
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to?: string }) => <a href={to ?? '#'}>{children}</a>,
  useSearch: () => ({ ...mockSearch }),
  useNavigate: () => vi.fn(),
}));

const { default: ClassicOptionsPage } = await import('./settings.options');

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({ accessToken: 'test', refreshToken: 'test', user: { iat: 0, exp: 4102444800, user: 'admin', uid: 1 }, isAuthenticated: true });
  server.listen({ onUnhandledRequest: 'warn' });
});
afterEach(() => { server.resetHandlers(); mockSearch.category = 'auth'; });
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

const row = (id: number, name: string, value: string, type: string, extra: Record<string, unknown> = {}) => ({
  id, name, value, type, category: 'auth', readonly: 0, private: 0, system: 0, source: 'db', prompt: `${name} prompt`, ...extra,
});

const CONFIGS = [
  row(1, 'ZM_OPT_USE_AUTH', '1', 'boolean'),
  row(2, 'ZM_AUTH_RELAY', 'hashed', 'string', { hint: 'hashed|plain|none', requires: 'ZM_OPT_USE_AUTH=1' }),
  row(3, 'ZM_AUTH_HASH_TTL', '2', 'integer', { requires: 'ZM_OPT_USE_AUTH=1;ZM_AUTH_RELAY=hashed' }),
  row(4, 'ZM_AUTH_HASH_IPS', '1', 'boolean', { requires: 'ZM_OPT_USE_AUTH=1;ZM_AUTH_RELAY=plain' }),
  row(5, 'ZM_PATH_FFMPEG', '/usr/bin/ffmpeg', 'string', {
    system: 1, source: 'file', source_file: '/etc/zm/conf.d/01-system-paths.conf', requires: 'ZM_OPT_USE_AUTH=1',
  }),
  row(6, 'ZM_AUTH_HASH_SECRET', 'abc123', 'string', {
    private: 1, source: 'file', source_file: '/etc/zm/conf.d/90-local.conf',
  }),
  row(7, 'ZM_OPT_USE_REMEMBER_ME', 'yes', 'boolean', { source: 'file', source_file: '/etc/zm/zm.conf' }),
  row(8, 'ZM_CASE_INSENSITIVE_USERNAMES', '0', 'boolean', { requires: 'ZM_OPT_USE_REMEMBER_ME=1' }),
];

let puts: Array<{ name: string; value: string }> = [];
function seed() {
  puts = [];
  server.use(
    http.get('/api/v3/system/status', () => HttpResponse.json({ running: true, daemons: [] })),
    http.get('/api/v3/host/getVersion', () => HttpResponse.json({ version: '1.39.41', api_version: '3.0' })),
    http.get('/api/v3/daemons', () => HttpResponse.json({ daemons: [] })),
    http.get('/api/v3/configs', () =>
      HttpResponse.json({ items: CONFIGS, total: CONFIGS.length, per_page: 500, current_page: 1, last_page: 1 })),
    http.put('/api/v3/configs/:name', async ({ params, request }) => {
      const body = await request.json() as { value: string };
      puts.push({ name: String(params.name), value: body.value });
      return HttpResponse.json({ name: params.name, value: body.value });
    }),
  );
}

async function mount() {
  seed();
  renderWithProviders(<ClassicOptionsPage />);
  await screen.findByLabelText('OPT_USE_AUTH');
}

describe('Classic Options — conf-file rows', () => {
  it('shows the value in effect, read-only, with the file named', async () => {
    await mount();
    const ffmpeg = screen.getByLabelText('PATH_FFMPEG');
    expect(ffmpeg).toBeDisabled();
    expect(ffmpeg).toHaveValue('/usr/bin/ffmpeg');
    expect(screen.getByText('Set by the system owner in /etc/zm/conf.d/01-system-paths.conf.')).toBeInTheDocument();
  });

  it('never shows a secret set in a file', async () => {
    await mount();
    const secret = screen.getByLabelText('AUTH_HASH_SECRET');
    expect(secret).toBeDisabled();
    expect(secret).toHaveValue('<set in config file>');
    expect(screen.getByText('Set by the system owner in /etc/zm/conf.d/90-local.conf. The value is not shown.')).toBeInTheDocument();
  });

  it('reads a boolean word from a file as 1 for the box and for requirements', async () => {
    await mount();
    expect(screen.getByLabelText('OPT_USE_REMEMBER_ME')).toBeChecked();
    expect(screen.getByLabelText('CASE_INSENSITIVE_USERNAMES')).toBeEnabled();
  });
});

describe('Classic Options — Requires', () => {
  it('disables a row whose compound requirement is not met', async () => {
    await mount();
    expect(screen.getByLabelText('AUTH_HASH_TTL')).toBeEnabled();
    // ZM_AUTH_RELAY is hashed, not plain.
    expect(screen.getByLabelText('AUTH_HASH_IPS')).toBeDisabled();
  });

  it('locks and unlocks dependents live as the controlling option changes', async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(screen.getByLabelText('OPT_USE_AUTH'));
    expect(screen.getByLabelText('AUTH_HASH_TTL')).toBeDisabled();
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();

    await user.click(screen.getByLabelText('OPT_USE_AUTH'));
    expect(screen.getByLabelText('AUTH_HASH_TTL')).toBeEnabled();
    // Switching the relay to plain swaps which hash row is open.
    await user.click(screen.getByRole('radio', { name: 'plain' }));
    expect(screen.getByLabelText('AUTH_HASH_TTL')).toBeDisabled();
    expect(screen.getByLabelText('AUTH_HASH_IPS')).toBeEnabled();
  });

  it('drops the edit to a row its requirement has just locked, as a disabled input is not submitted', async () => {
    const user = userEvent.setup();
    await mount();
    const ttl = screen.getByLabelText('AUTH_HASH_TTL');
    await user.clear(ttl);
    await user.type(ttl, '5');
    await user.click(screen.getByLabelText('OPT_USE_AUTH'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(puts).toEqual([{ name: 'ZM_OPT_USE_AUTH', value: '0' }]));
  });
});

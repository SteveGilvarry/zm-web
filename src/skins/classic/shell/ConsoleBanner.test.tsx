/**
 * `ZM_WEB_CONSOLE_BANNER` under the classic stat strip (legacy
 * `getConsoleBannerHTML`): an `<h2>` when set, nothing when empty.
 */
import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw/http';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import { ClassicConsoleBanner } from './ConsoleBanner';

let banner = '';
let configCalls = 0;
const server = setupServer(
  http.get('/api/v3/configs', () => {
    configCalls++;
    return HttpResponse.json({
      items: [{ id: 1, name: 'ZM_WEB_CONSOLE_BANNER', value: banner, type: 'string', category: 'web', readonly: 0, private: 0, system: 0 }],
      total: 1, per_page: 1000, current_page: 1, last_page: 1,
    });
  }),
);
beforeAll(() => {
  useAuthStore.setState({ accessToken: 't', refreshToken: 't', isAuthenticated: true, user: null });
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => { server.resetHandlers(); banner = ''; configCalls = 0; });
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

describe('ClassicConsoleBanner', () => {
  it('shows the banner text as a heading', async () => {
    banner = 'Maintenance tonight 22:00';
    renderWithProviders(<ClassicConsoleBanner />);
    expect(await screen.findByRole('heading', { level: 2, name: 'Maintenance tonight 22:00' })).toBeInTheDocument();
  });

  it('renders nothing when the option is empty', async () => {
    const { container } = renderWithProviders(<ClassicConsoleBanner />);
    await waitFor(() => expect(configCalls).toBeGreaterThan(0));
    expect(container).toBeEmptyDOMElement();
  });
});

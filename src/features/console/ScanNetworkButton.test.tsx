/**
 * Legacy console `SCAN NETWORK`. The discovery dialog is resolved through
 * `import.meta.glob` and code-split, so the button must survive the async
 * import and only mount the wizard once the operator asks for it.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import { ScanNetworkButton } from './ScanNetworkButton';

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({ accessToken: 't', refreshToken: 't', user: null, isAuthenticated: true });
  server.listen({ onUnhandledRequest: 'bypass' });
});
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

/** console.php:186 gates the button on an arp binary being configured. */
function stubArp(value: string) {
  server.use(
    http.get('/api/v3/configs', () => HttpResponse.json({
      items: [{ id: 1, name: 'ZM_PATH_ARP', value, type: 'string', category: 'system', readonly: 0, private: 0, system: 0 }],
      total: 1, per_page: 1000, current_page: 1, last_page: 1,
    })),
  );
}

describe('ScanNetworkButton', () => {
  it('renders the legacy verb and mounts nothing until it is clicked', async () => {
    stubArp('/usr/sbin/arp');
    renderWithProviders(<ScanNetworkButton />);
    expect(await screen.findByRole('button', { name: 'Scan Network' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders nothing on a box with no arp binary configured', async () => {
    stubArp('');
    renderWithProviders(<ScanNetworkButton />);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Scan Network' })).toBeNull());
  });

  it('opens the discovery wizard on click and closes it again', async () => {
    const user = userEvent.setup();
    stubArp('/usr/sbin/arp');
    renderWithProviders(<ScanNetworkButton />);

    await user.click(await screen.findByRole('button', { name: 'Scan Network' }));
    // Lazy chunk: the dialog appears once the dynamic import resolves.
    const dialog = await screen.findByRole('dialog', { name: 'Scan network for cameras' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    // Opening the wizard alone probes nothing — the operator drives the scan.
    expect(screen.getByRole('button', { name: 'Scan' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('button', { name: 'Scan Network' })).toBeInTheDocument();
  });
});

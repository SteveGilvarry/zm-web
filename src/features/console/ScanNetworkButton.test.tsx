/**
 * Legacy console `SCAN NETWORK`. The discovery dialog is resolved through
 * `import.meta.glob` and code-split, so the button must survive the async
 * import and only mount the wizard once the operator asks for it.
 */
import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { ScanNetworkButton } from './ScanNetworkButton';

describe('ScanNetworkButton', () => {
  it('renders the legacy verb and mounts nothing until it is clicked', () => {
    renderWithProviders(<ScanNetworkButton />);
    expect(screen.getByRole('button', { name: 'Scan Network' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens the discovery wizard on click and closes it again', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ScanNetworkButton />);

    await user.click(screen.getByRole('button', { name: 'Scan Network' }));
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

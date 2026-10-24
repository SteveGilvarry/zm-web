/**
 * Legacy `getStatusBtnHTML`: System Edit gets a button that opens the run
 * state chooser; System View only gets the state as text.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';

let runState = { running: true, label: 'Running', busy: false };
vi.mock('@/features/state/useRunState', () => ({
  useRunState: () => runState,
}));

vi.mock('@/features/state/RunStateChooser', () => ({
  RunStateChooser: ({ isOpen, onClose, running }: { isOpen: boolean; onClose: () => void; running: boolean }) =>
    isOpen ? (
      <div role="dialog" aria-label="Run State">
        <span>{running ? 'chooser sees running' : 'chooser sees stopped'}</span>
        <button type="button" onClick={onClose}>Cancel</button>
      </div>
    ) : null,
}));

const { ClassicStatusButton } = await import('./StatusButton');

describe('ClassicStatusButton', () => {
  it('renders the state as plain text when the user cannot change it', () => {
    runState = { running: true, label: 'Running', busy: false };
    renderWithProviders(<ClassicStatusButton canChange={false} />);
    expect(screen.getByTestId('classic-run-state')).toHaveTextContent('Running');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('opens the chooser from the button and closes it again', async () => {
    runState = { running: false, label: 'Stopped', busy: false };
    const user = userEvent.setup();
    renderWithProviders(<ClassicStatusButton canChange />);

    const button = screen.getByRole('button', { name: /Run state: Stopped/ });
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(button);
    expect(screen.getByRole('dialog')).toHaveTextContent('chooser sees stopped');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('disables the button while the state is still loading', () => {
    runState = { running: true, label: 'Running', busy: true };
    renderWithProviders(<ClassicStatusButton canChange />);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});

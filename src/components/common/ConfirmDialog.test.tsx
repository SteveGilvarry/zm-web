import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { ConfirmDialog } from './ConfirmDialog';

function open(props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  renderWithProviders(
    <ConfirmDialog
      isOpen
      onClose={onClose}
      onConfirm={onConfirm}
      title="Delete Event"
      message="Delete event #1?"
      {...props}
    />,
  );
  return { onConfirm, onClose };
}

describe('ConfirmDialog', () => {
  it('confirms on Enter, as the legacy modals do', async () => {
    const user = userEvent.setup();
    const { onConfirm, onClose } = open();

    await user.keyboard('{Enter}');

    expect(onConfirm).toHaveBeenCalledTimes(1);
    // Focus lands on Cancel when the dialog opens; Enter must not fire it.
    expect(onClose).not.toHaveBeenCalled();
  });

  it('ignores Enter while the action is in flight', async () => {
    const user = userEvent.setup();
    const { onConfirm } = open({ isLoading: true });

    await user.keyboard('{Enter}');

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('still closes on Escape and on the Cancel button', async () => {
    const user = userEvent.setup();
    const { onClose, onConfirm } = open();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

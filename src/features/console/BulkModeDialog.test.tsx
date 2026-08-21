/**
 * Legacy console "SELECT" dialog — set Capturing / Analysing / Recording on
 * every checked monitor at once. A blank select must leave that column alone.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { BulkModeDialog } from './BulkModeDialog';

function mount(props: Partial<React.ComponentProps<typeof BulkModeDialog>> = {}) {
  const onClose = vi.fn();
  const onApply = vi.fn();
  const result = renderWithProviders(
    <BulkModeDialog open count={3} onClose={onClose} onApply={onApply} {...props} />,
  );
  return { ...result, onClose, onApply };
}

describe('BulkModeDialog', () => {
  it('renders nothing while closed', () => {
    mount({ open: false });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('names the dialog after the number of selected monitors', () => {
    mount({ count: 3 });
    expect(screen.getByRole('dialog')).toHaveAccessibleName(/3/);
  });

  it('offers the three legacy mode columns with their legacy options', () => {
    mount();
    const capturing = screen.getByLabelText('Capturing') as HTMLSelectElement;
    const analysing = screen.getByLabelText('Analysing') as HTMLSelectElement;
    const recording = screen.getByLabelText('Recording') as HTMLSelectElement;

    expect(Array.from(capturing.options).map((o) => o.value))
      .toEqual(['', 'None', 'Ondemand', 'Always']);
    expect(Array.from(analysing.options).map((o) => o.value)).toEqual(['', 'None', 'Always']);
    expect(Array.from(recording.options).map((o) => o.value))
      .toEqual(['', 'None', 'OnMotion', 'Always']);

    // Every column starts on "leave unchanged".
    for (const select of [capturing, analysing, recording]) expect(select.value).toBe('');
    expect(within(capturing).getByRole('option', { name: 'Leave unchanged' })).toBeInTheDocument();
  });

  it('humanises the compound mode values in the option labels', () => {
    mount();
    expect(within(screen.getByLabelText('Capturing')).getByRole('option', { name: 'On Demand' }))
      .toHaveValue('Ondemand');
    expect(within(screen.getByLabelText('Recording')).getByRole('option', { name: 'On Motion' }))
      .toHaveValue('OnMotion');
  });

  it('keeps Apply disabled until a column is actually changed', async () => {
    const user = userEvent.setup();
    const { onApply } = mount();
    const apply = screen.getByRole('button', { name: 'Apply' });
    expect(apply).toBeDisabled();

    await user.selectOptions(screen.getByLabelText('Analysing'), 'None');
    expect(apply).toBeEnabled();

    // Back to "leave unchanged" and it locks again.
    await user.selectOptions(screen.getByLabelText('Analysing'), '');
    expect(apply).toBeDisabled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('applies only the columns the operator set', async () => {
    const user = userEvent.setup();
    const { onApply } = mount();
    await user.selectOptions(screen.getByLabelText('Capturing'), 'Always');
    await user.selectOptions(screen.getByLabelText('Recording'), 'OnMotion');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onApply).toHaveBeenCalledOnce();
    const update = onApply.mock.calls[0][0] as Record<string, unknown>;
    expect(update.capturing).toBe('Always');
    expect(update.recording).toBe('OnMotion');
    // Untouched column carries no value, so the caller leaves it alone.
    expect(update.analysing).toBeUndefined();
  });

  it('shows a saving label and blocks a second submit while busy', async () => {
    const user = userEvent.setup();
    const { onApply, rerender } = mount();
    await user.selectOptions(screen.getByLabelText('Capturing'), 'None');

    rerender(
      <BulkModeDialog open count={3} busy onClose={() => {}} onApply={onApply} />,
    );
    const saving = screen.getByRole('button', { name: 'Saving…' });
    expect(saving).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
    await user.click(saving);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('closes from Cancel and from Escape without applying', async () => {
    const user = userEvent.setup();
    const { onClose, onApply } = mount();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onApply).not.toHaveBeenCalled();
  });
});

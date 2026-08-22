import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LogColumnKey } from './csv';

import { ALL_LOG_COLUMNS } from './columns';
import { ColumnPicker } from './ColumnPicker';

describe('ColumnPicker', () => {
  it('renders one checkbox per known log column', () => {
    render(
      <ColumnPicker
        visible={['timestamp', 'level', 'message']}
        onChange={() => {}}
        onClose={() => {}}
      />,
    );
    for (const col of ALL_LOG_COLUMNS) {
      const cb = screen.getByRole('checkbox', { name: new RegExp(`toggle ${col}`, 'i') });
      expect(cb).toBeInTheDocument();
    }
  });

  it('checkboxes reflect which columns are currently visible', () => {
    render(
      <ColumnPicker
        visible={['timestamp', 'message']}
        onChange={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole('checkbox', { name: /toggle timestamp/i }))
      .toBeChecked();
    expect(screen.getByRole('checkbox', { name: /toggle message/i }))
      .toBeChecked();
    expect(screen.getByRole('checkbox', { name: /toggle pid/i }))
      .not.toBeChecked();
  });

  it('toggling a hidden column adds it in canonical order', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(cols: LogColumnKey[]) => void>();
    render(
      <ColumnPicker
        visible={['timestamp', 'message']}
        onChange={onChange}
        onClose={() => {}}
      />,
    );
    // Add 'level' — should land between timestamp and message per ALL_LOG_COLUMNS order.
    await user.click(screen.getByRole('checkbox', { name: /toggle level/i }));
    expect(onChange).toHaveBeenCalledWith(['timestamp', 'level', 'message']);
  });

  it('toggling a visible column removes it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(cols: LogColumnKey[]) => void>();
    render(
      <ColumnPicker
        visible={['timestamp', 'level', 'message']}
        onChange={onChange}
        onClose={() => {}}
      />,
    );
    await user.click(screen.getByRole('checkbox', { name: /toggle level/i }));
    expect(onChange).toHaveBeenCalledWith(['timestamp', 'message']);
  });

  it('refuses to leave the table with zero visible columns', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(cols: LogColumnKey[]) => void>();
    render(
      <ColumnPicker
        visible={['message']}
        onChange={onChange}
        onClose={() => {}}
      />,
    );
    await user.click(screen.getByRole('checkbox', { name: /toggle message/i }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('fires onClose when the click-outside scrim is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(
      <ColumnPicker
        visible={['timestamp']}
        onChange={() => {}}
        onClose={onClose}
      />,
    );
    const scrim = container.querySelector('[aria-hidden="true"]');
    expect(scrim).not.toBeNull();
    await user.click(scrim!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

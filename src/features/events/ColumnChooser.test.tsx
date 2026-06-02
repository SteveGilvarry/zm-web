import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { ColumnChooser } = await import('./ColumnChooser');
const { useEventsColumnsStore } = await import('@/stores/eventsColumns');

beforeEach(() => {
  useEventsColumnsStore.getState().resetDefaults();
});

describe('ColumnChooser', () => {
  it('opens the dropdown when clicked', async () => {
    const user = userEvent.setup();
    render(<ColumnChooser />);

    // Closed: column labels are not in the DOM.
    expect(screen.queryByRole('menu')).toBeNull();

    await user.click(screen.getByRole('button', { name: /columns/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByText('Tags')).toBeInTheDocument();
    expect(screen.getByText('DiskSpace')).toBeInTheDocument();
  });

  it('toggling a column updates the persisted store', async () => {
    const user = userEvent.setup();
    render(<ColumnChooser />);

    await user.click(screen.getByRole('button', { name: /columns/i }));
    // Tags ships default-visible; clicking should hide it.
    await user.click(screen.getByLabelText(/toggle column tags/i));

    expect(useEventsColumnsStore.getState().isVisible('tags')).toBe(false);
  });

  it('Defaults button restores the shipped defaults', async () => {
    const user = userEvent.setup();
    // Pre-state: every column visible.
    useEventsColumnsStore.getState().showAll();
    render(<ColumnChooser />);

    await user.click(screen.getByRole('button', { name: /columns/i }));
    await user.click(screen.getByRole('button', { name: /defaults/i }));

    expect(useEventsColumnsStore.getState().isVisible('disk_space')).toBe(false);
    expect(useEventsColumnsStore.getState().isVisible('archived')).toBe(false);
  });
});

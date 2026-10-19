import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { MonitorActionButtons } from './MonitorActionButtons';
import { manualActions } from './useManualActions';
import type { MonitorAction } from '@/api/monitorActions';

const row = (over: Partial<MonitorAction>): MonitorAction => ({
  id: 1, monitor_id: 3, target_monitor_id: 8, action_type: 'LightOn', trigger_on: 'Manual',
  label: '', enabled: true, sequence: 0, ...over,
});

describe('manualActions', () => {
  it('keeps enabled Manual rows, ordered by Sequence then Id', () => {
    const rows = [
      row({ id: 4, sequence: 2 }),
      row({ id: 3, sequence: 1 }),
      row({ id: 2, sequence: 1 }),
      row({ id: 5, trigger_on: 'EventStart' }),
      row({ id: 6, enabled: false }),
    ];
    expect(manualActions(rows).map((a) => a.id)).toEqual([2, 3, 4]);
  });
});

describe('MonitorActionButtons', () => {
  it('renders nothing without actions', () => {
    const { container } = renderWithProviders(
      <MonitorActionButtons state={{ actions: [], run: vi.fn() }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('runs an action and shows a failure in place', async () => {
    const run = vi.fn().mockRejectedValue(new Error('speaker offline'));
    const user = userEvent.setup();
    renderWithProviders(
      <MonitorActionButtons state={{ actions: [{ id: 9, label: 'Siren' }], run }} />,
    );
    await user.click(screen.getByRole('button', { name: 'Siren' }));
    expect(run).toHaveBeenCalledWith(9);
    expect(await screen.findByRole('alert')).toHaveTextContent('Siren: speaker offline');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Siren' })).toBeEnabled());
  });
});

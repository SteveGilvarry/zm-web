/**
 * One row of the Options → Daemons list. The row is pure presentation: it
 * shows the daemon name and offers the verbs that make sense for its state
 * (a running daemon can be stopped, anything else can be started; restart is
 * always offered), and every button goes dead while an action is in flight.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { makeDaemon } from '@/test/fixtures';
import type { DaemonStatus } from '@/types';
import { DaemonRow } from './DaemonRow';

function mount(daemon: Partial<DaemonStatus> = {}, isLoading = false) {
  const onAction = vi.fn();
  renderWithProviders(
    <DaemonRow daemon={makeDaemon(daemon)} onAction={onAction} isLoading={isLoading} />,
  );
  return { onAction };
}

const buttonNames = () =>
  screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'));

describe('DaemonRow', () => {
  it('names the daemon and offers Stop + Restart while it runs', () => {
    mount({ name: 'zmc -m 1', state: 'running' });
    expect(screen.getByText('zmc -m 1')).toBeInTheDocument();
    expect(buttonNames()).toEqual(['Stop', 'Restart']);
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
  });

  it('offers Start + Restart when stopped', () => {
    mount({ name: 'zma -m 2', state: 'stopped' });
    expect(buttonNames()).toEqual(['Start', 'Restart']);
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument();
  });

  it('treats an unknown state as not-running, so Start is still offered', () => {
    mount({ state: 'unknown' });
    expect(buttonNames()).toEqual(['Start', 'Restart']);
  });

  it.each([
    ['running', 'Stop', 'stop'],
    ['stopped', 'Start', 'start'],
    ['running', 'Restart', 'restart'],
    ['stopped', 'Restart', 'restart'],
  ])('from %s, %s asks for the "%s" action', async (state, label, action) => {
    const user = userEvent.setup();
    const { onAction } = mount({ state });
    await user.click(screen.getByRole('button', { name: label }));
    expect(onAction).toHaveBeenCalledExactlyOnceWith(action);
  });

  it('disables every verb while an action is in flight', async () => {
    const user = userEvent.setup();
    const { onAction } = mount({ state: 'running' }, true);
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled();
    }
    await user.click(screen.getByRole('button', { name: 'Restart' }));
    expect(onAction).not.toHaveBeenCalled();
  });

  it('exposes the verb as a tooltip as well as an accessible name', () => {
    mount({ state: 'running' });
    expect(screen.getByRole('button', { name: 'Stop' })).toHaveAttribute('title', 'Stop');
    expect(screen.getByRole('button', { name: 'Restart' })).toHaveAttribute('title', 'Restart');
  });
});

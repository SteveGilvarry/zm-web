/**
 * One row of the Options config table: the name + prompt, the collapsible
 * help text, the value cell (display → inline editor), the "reset to
 * default" affordance and the read-only / secret / dirty variants.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { makeConfig } from '@/test/fixtures';
import type { ZmConfig } from '@/types';
import { ConfigRow } from './ConfigRow';

type Props = Partial<Parameters<typeof ConfigRow>[0]>;

function mount(config: Partial<ZmConfig> = {}, props: Props = {}) {
  const handlers = {
    onEditValueChange: vi.fn(),
    onStartEdit: vi.fn(),
    onSave: vi.fn(),
    onCancel: vi.fn(),
  };
  const result = renderWithProviders(
    <table>
      <tbody>
        <ConfigRow
          config={makeConfig(config)}
          isEditing={false}
          editValue=""
          isSaving={false}
          {...handlers}
          {...props}
        />
      </tbody>
    </table>,
  );
  return { ...handlers, ...result };
}

describe('ConfigRow — display', () => {
  it('shows the config name, its prompt and its stored value', () => {
    mount({ name: 'ZM_WEB_TITLE', prompt: 'Web site title', value: 'ZoneMinder' });
    expect(screen.getByText('ZM_WEB_TITLE')).toBeInTheDocument();
    expect(screen.getByText('Web site title')).toBeInTheDocument();
    expect(screen.getByText('ZoneMinder')).toHaveAttribute('title', 'ZoneMinder');
  });

  it('renders a boolean value through the display formatter', () => {
    mount({ type: 'boolean', value: '1', hint: null, default_value: 'yes' });
    expect(screen.getByText('enabled')).toBeInTheDocument();
  });

  it('marks a blank value as empty rather than leaving a hole', () => {
    mount({ value: '', default_value: '' });
    expect(screen.getByText('empty')).toBeInTheDocument();
  });

  it('starts an edit when the value is clicked', async () => {
    const user = userEvent.setup();
    const { onStartEdit } = mount({ value: 'ZoneMinder' });
    await user.click(screen.getByText('ZoneMinder'));
    expect(onStartEdit).toHaveBeenCalledOnce();
  });

  it('locks a read-only row: no edit on click, and a labelled lock icon', async () => {
    const user = userEvent.setup();
    const { onStartEdit } = mount({ readonly: 1, value: 'ZoneMinder' });
    await user.click(screen.getByText('ZoneMinder'));
    expect(onStartEdit).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Read-only')).toBeInTheDocument();
  });

  it.each([
    ['a private row', { private: 1, value: 'hunter2' } as Partial<ZmConfig>],
    ['a password-typed row', { type: 'password', value: 'hunter2' } as Partial<ZmConfig>],
  ])('never prints the value of %s', (_label, config) => {
    mount(config);
    expect(screen.getByText('••••••••')).not.toHaveAttribute('title');
    expect(screen.queryByText('hunter2')).not.toBeInTheDocument();
  });
});

describe('ConfigRow — help', () => {
  it('toggles the help row and flips its button label', async () => {
    const user = userEvent.setup();
    mount({ help: '  Title used in the web interface.  ' });
    const toggle = screen.getByRole('button', { name: 'Show help' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Title used in the web interface.')).not.toBeInTheDocument();

    await user.click(toggle);
    expect(screen.getByRole('button', { name: 'Hide help' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Title used in the web interface.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Hide help' }));
    expect(screen.queryByText('Title used in the web interface.')).not.toBeInTheDocument();
  });

  it('offers no toggle when the row has no help text', () => {
    mount({ help: null });
    expect(screen.queryByRole('button', { name: /help/i })).not.toBeInTheDocument();
  });
});

describe('ConfigRow — reset to default', () => {
  const changed = { name: 'ZM_WEB_TITLE', value: 'Cameras', default_value: 'ZoneMinder' };

  it('offers a reset only once the value differs from the default', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    mount(changed, { onReset });
    const reset = screen.getByRole('button', { name: 'Reset ZM_WEB_TITLE to default' });
    expect(reset).toHaveAttribute('title', 'Reset to default (ZoneMinder)');
    await user.click(reset);
    expect(onReset).toHaveBeenCalledOnce();
  });

  it('hides the reset when the row is already at its default', () => {
    mount({ value: 'ZoneMinder', default_value: 'ZoneMinder' }, { onReset: vi.fn() });
    expect(screen.queryByRole('button', { name: /Reset/ })).not.toBeInTheDocument();
  });

  it('hides the reset when the caller supplies no handler, or the row is read-only', () => {
    const { unmount } = mount(changed);
    expect(screen.queryByRole('button', { name: /Reset/ })).not.toBeInTheDocument();
    unmount();

    mount({ ...changed, readonly: 1 }, { onReset: vi.fn() });
    expect(screen.queryByRole('button', { name: /Reset/ })).not.toBeInTheDocument();
  });

  it('masks the default in the tooltip for a secret row, and disables while saving', () => {
    mount(
      { ...changed, private: 1 },
      { onReset: vi.fn(), isSaving: true },
    );
    const reset = screen.getByRole('button', { name: 'Reset ZM_WEB_TITLE to default' });
    expect(reset).toHaveAttribute('title', 'Reset to default (••••)');
    expect(reset).toBeDisabled();
  });
});

describe('ConfigRow — pending "save all" value', () => {
  it('shows the typed-but-unwritten value with an unsaved badge', () => {
    mount({ value: 'ZoneMinder' }, { dirtyValue: 'Cameras' });
    expect(screen.getByText('Cameras')).toHaveAttribute('title', 'Cameras');
    expect(screen.getByText('unsaved')).toBeInTheDocument();
    expect(screen.queryByText('ZoneMinder')).not.toBeInTheDocument();
  });

  it('masks a dirty secret value too', () => {
    mount({ type: 'password', value: 'old' }, { dirtyValue: 'hunter2' });
    expect(screen.getByText('••••••••')).toBeInTheDocument();
    expect(screen.queryByText('hunter2')).not.toBeInTheDocument();
  });
});

describe('ConfigRow — editing', () => {
  it('edits through the typed input and commits with Enter or the Save button', async () => {
    const user = userEvent.setup();
    const { onEditValueChange, onSave } = mount(
      { name: 'ZM_WEB_TITLE', value: 'ZoneMinder' },
      { isEditing: true, editValue: 'Cameras' },
    );
    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('Cameras');

    await user.type(input, '!');
    expect(onEditValueChange).toHaveBeenCalledWith('Cameras!');

    await user.keyboard('{Enter}');
    expect(onSave).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it('abandons the edit on Escape', async () => {
    const user = userEvent.setup();
    const { onCancel } = mount({}, { isEditing: true, editValue: 'Cameras' });
    await user.type(screen.getByRole('textbox'), '{Escape}');
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('surfaces a pattern error and blocks Save on it', () => {
    mount(
      { name: 'ZM_MAX_RESTART_DELAY', type: 'integer' },
      { isEditing: true, editValue: 'abc', editError: 'Value does not match the required pattern ^\\d+$' },
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Value does not match the required pattern');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('blocks Save while the write is in flight', () => {
    mount({}, { isEditing: true, editValue: 'Cameras', isSaving: true });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});

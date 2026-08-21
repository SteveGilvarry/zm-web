/**
 * The `TypedConfigInput` branches the first pass left cold: every widget's
 * `onChange`, the `private` override, the enum fallback option, and the
 * keyboard rules (textarea must not commit on Enter; missing handlers must
 * not throw).
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ZmConfig } from '@/types';
import { TypedConfigInput } from './TypedConfigInput';

function cfg(over: Partial<ZmConfig>): ZmConfig {
  return {
    id: 1, name: 'ZM_SAMPLE', value: '', type: 'string',
    category: 'system', readonly: 0, private: 0, system: 1,
    ...over,
  } as ZmConfig;
}

describe('TypedConfigInput — change handlers', () => {
  it('reports typed text from the plain string input', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TypedConfigInput config={cfg({ type: 'string' })} value="" onChange={onChange} />);
    await user.type(screen.getByRole('textbox'), 'x');
    expect(onChange).toHaveBeenLastCalledWith('x');
  });

  it('reports typed digits from the integer and decimal inputs', async () => {
    const user = userEvent.setup();
    const onInt = vi.fn();
    const { unmount } = render(
      <TypedConfigInput config={cfg({ type: 'integer' })} value="" onChange={onInt} />,
    );
    await user.type(screen.getByRole('spinbutton'), '7');
    expect(onInt).toHaveBeenLastCalledWith('7');
    unmount();

    const onDec = vi.fn();
    render(<TypedConfigInput config={cfg({ type: 'decimal' })} value="" onChange={onDec} />);
    await user.type(screen.getByRole('spinbutton'), '3');
    expect(onDec).toHaveBeenLastCalledWith('3');
  });

  it('reports typed text from the hexadecimal input and disables spellcheck', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TypedConfigInput config={cfg({ type: 'hexadecimal' })} value="" onChange={onChange} />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('spellcheck', 'false');
    await user.type(input, 'f');
    expect(onChange).toHaveBeenLastCalledWith('f');
  });

  it('reports typed text from the password input', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(
      <TypedConfigInput config={cfg({ type: 'password' })} value="" onChange={onChange} />,
    );
    const input = container.querySelector('input')!;
    expect(input.autocomplete).toBe('new-password');
    await user.type(input, 's');
    expect(onChange).toHaveBeenLastCalledWith('s');
  });

  it('reports typed text from the textarea', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TypedConfigInput config={cfg({ type: 'text' })} value="" onChange={onChange} />);
    await user.type(screen.getByRole('textbox'), 'a');
    expect(onChange).toHaveBeenLastCalledWith('a');
  });

  it('reports the picked option from the enum select', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TypedConfigInput
        config={cfg({ type: 'string', hint: 'hashed|plain|none' })}
        value="hashed"
        onChange={onChange}
      />,
    );
    await user.selectOptions(screen.getByRole('combobox'), 'plain');
    expect(onChange).toHaveBeenCalledWith('plain');
  });
});

describe('TypedConfigInput — widget overrides', () => {
  it('masks any private row as a password, whatever its declared type', () => {
    const { container } = render(
      <TypedConfigInput config={cfg({ type: 'string', private: 1 })} value="hunter2" onChange={() => {}} />,
    );
    expect(container.querySelector('input')!.type).toBe('password');
  });

  it('falls back to a text input for a type the backend has not taught us', () => {
    const { container } = render(
      <TypedConfigInput
        config={cfg({ type: 'geometry' as unknown as ZmConfig['type'] })}
        value="1x1"
        onChange={() => {}}
      />,
    );
    expect(container.querySelector('input')!.type).toBe('text');
  });

  it('treats "true"/"yes" as a ticked boolean and emits "0" when unticked', async () => {
    const user = userEvent.setup();
    for (const truthy of ['true', 'YES', '1']) {
      const onChange = vi.fn();
      const { unmount } = render(
        <TypedConfigInput config={cfg({ type: 'boolean' })} value={truthy} onChange={onChange} />,
      );
      const box = screen.getByRole('checkbox') as HTMLInputElement;
      expect(box.checked, truthy).toBe(true);
      await user.click(box);
      expect(onChange).toHaveBeenCalledWith('0');
      unmount();
    }
  });

  it('shows the current value as an extra option when it is outside the enum', () => {
    render(
      <TypedConfigInput
        config={cfg({ type: 'string', hint: 'hashed|plain|none' })}
        value="legacy-md5"
        onChange={() => {}}
      />,
    );
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('legacy-md5');
    expect(Array.from(select.options).map((o) => o.value)).toEqual(
      ['legacy-md5', 'hashed', 'plain', 'none'],
    );
  });

  it('labels the extra option "(unset)" when the stored value is blank', () => {
    render(
      <TypedConfigInput
        config={cfg({ type: 'string', hint: 'hashed|plain|none' })}
        value=""
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('option', { name: '(unset)' })).toBeInTheDocument();
  });
});

describe('TypedConfigInput — keyboard', () => {
  it('does not commit on Enter inside a textarea (newlines are content there)', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    render(
      <TypedConfigInput
        config={cfg({ type: 'text' })}
        value="a"
        onChange={() => {}}
        onCommit={onCommit}
        onCancel={onCancel}
      />,
    );
    const area = screen.getByRole('textbox');
    area.focus();
    await user.keyboard('{Enter}');
    expect(onCommit).not.toHaveBeenCalled();
    // Escape still cancels from a textarea.
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('commits and cancels from the enum select', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    render(
      <TypedConfigInput
        config={cfg({ type: 'string', hint: 'a|b' })}
        value="a"
        onChange={() => {}}
        onCommit={onCommit}
        onCancel={onCancel}
      />,
    );
    screen.getByRole('combobox').focus();
    await user.keyboard('{Enter}');
    expect(onCommit).toHaveBeenCalledOnce();
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('ignores Enter and Escape when no handlers are wired', async () => {
    const user = userEvent.setup();
    render(<TypedConfigInput config={cfg({ type: 'string' })} value="a" onChange={() => {}} />);
    screen.getByRole('textbox').focus();
    await user.keyboard('{Enter}{Escape}');
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('autoFocuses the widget when asked', () => {
    render(<TypedConfigInput config={cfg({ type: 'string' })} value="a" onChange={() => {}} autoFocus />);
    expect(screen.getByRole('textbox')).toHaveFocus();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ZmConfig } from '@/types';
import { TypedConfigInput } from './TypedConfigInput';
import { formatConfigValue, enumOptionsFromHint, humanizeIdent } from './configFormat';

function cfg(over: Partial<ZmConfig>): ZmConfig {
  return {
    id: 1, name: 'ZM_SAMPLE', value: '', type: 'string',
    category: 'system', readonly: 0, private: 0, system: 1,
    ...over,
  };
}

describe('humanizeIdent', () => {
  it('title-cases a single lowercase token', () => {
    expect(humanizeIdent('system')).toBe('System');
    expect(humanizeIdent('logging')).toBe('Logging');
  });
  it('splits snake_case and dash-separated identifiers', () => {
    expect(humanizeIdent('highbandwidth')).toBe('Highbandwidth');
    expect(humanizeIdent('high_bandwidth')).toBe('High Bandwidth');
    expect(humanizeIdent('high-bandwidth')).toBe('High Bandwidth');
  });
  it('keeps acronyms uppercase', () => {
    expect(humanizeIdent('mqtt')).toBe('MQTT');
    expect(humanizeIdent('onvif')).toBe('ONVIF');
    expect(humanizeIdent('http_api')).toBe('HTTP API');
    expect(humanizeIdent('x10')).toBe('X10');
  });
  it('handles mixed acronyms and words', () => {
    expect(humanizeIdent('zm_path')).toBe('ZM Path');
    expect(humanizeIdent('jpeg_quality')).toBe('JPEG Quality');
  });
  it('round-trips enum tokens through dropdown labels', () => {
    expect(humanizeIdent('hashed')).toBe('Hashed');
    expect(humanizeIdent('plain')).toBe('Plain');
    expect(humanizeIdent('none')).toBe('None');
    expect(humanizeIdent('builtin')).toBe('Builtin');
    expect(humanizeIdent('remote')).toBe('Remote');
  });
});

describe('enumOptionsFromHint', () => {
  it('returns the pipe-split tokens for an enum-shaped hint', () => {
    expect(enumOptionsFromHint('hashed|plain|none')).toEqual(['hashed', 'plain', 'none']);
    expect(enumOptionsFromHint('builtin|remote')).toEqual(['builtin', 'remote']);
  });
  it('returns null for non-enum hints', () => {
    expect(enumOptionsFromHint('string')).toBeNull();
    expect(enumOptionsFromHint('integer')).toBeNull();
    expect(enumOptionsFromHint(null)).toBeNull();
    expect(enumOptionsFromHint(undefined)).toBeNull();
  });
});

describe('TypedConfigInput — widget selection', () => {
  it('renders a checkbox for type=boolean', () => {
    render(<TypedConfigInput config={cfg({ type: 'boolean' })} value="1" onChange={() => {}} />);
    const cb = screen.getByRole('checkbox') as HTMLInputElement;
    expect(cb.checked).toBe(true);
    expect(screen.getByText('enabled')).toBeInTheDocument();
  });

  it('boolean unchecked when value is "0"', () => {
    render(<TypedConfigInput config={cfg({ type: 'boolean' })} value="0" onChange={() => {}} />);
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText('disabled')).toBeInTheDocument();
  });

  it('toggles checkbox emits "1"/"0" string', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TypedConfigInput config={cfg({ type: 'boolean' })} value="0" onChange={onChange} />);
    await user.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledWith('1');
  });

  it('renders type="number" with step=1 for type=integer', () => {
    const { container } = render(
      <TypedConfigInput config={cfg({ type: 'integer' })} value="42" onChange={() => {}} />,
    );
    const input = container.querySelector('input')!;
    expect(input.type).toBe('number');
    expect(input.step).toBe('1');
    expect(input.value).toBe('42');
  });

  it('renders type="number" with step="any" for type=decimal', () => {
    const { container } = render(
      <TypedConfigInput config={cfg({ type: 'decimal' })} value="1.5" onChange={() => {}} />,
    );
    const input = container.querySelector('input')!;
    expect(input.step).toBe('any');
  });

  it('renders type="password" for type=password', () => {
    const { container } = render(
      <TypedConfigInput config={cfg({ type: 'password' })} value="hunter2" onChange={() => {}} />,
    );
    expect(container.querySelector('input')!.type).toBe('password');
  });

  it('renders a textarea for type=text', () => {
    const { container } = render(
      <TypedConfigInput config={cfg({ type: 'text' })} value="multi\nline" onChange={() => {}} />,
    );
    expect(container.querySelector('textarea')).not.toBeNull();
  });

  it('renders a hex-patterned text input for type=hexadecimal', () => {
    const { container } = render(
      <TypedConfigInput config={cfg({ type: 'hexadecimal' })} value="0xff00ff" onChange={() => {}} />,
    );
    const input = container.querySelector('input')!;
    expect(input.type).toBe('text');
    expect(input.pattern).toBe('(0x)?[0-9A-Fa-f]+');
  });

  it('renders a <select> for type=string with pipe-separated hint', () => {
    render(
      <TypedConfigInput
        config={cfg({ type: 'string', hint: 'hashed|plain|none' })}
        value="hashed"
        onChange={() => {}}
      />,
    );
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('hashed');
    // Three enum options.
    const opts = Array.from(select.options).map((o) => o.value);
    expect(opts).toEqual(expect.arrayContaining(['hashed', 'plain', 'none']));
  });

  it('renders text input for type=string when hint is not enum-shaped', () => {
    const { container } = render(
      <TypedConfigInput config={cfg({ type: 'string', hint: 'string' })} value="abc" onChange={() => {}} />,
    );
    const input = container.querySelector('input')!;
    expect(input.type).toBe('text');
  });

  it('committed via Enter key on text inputs', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(
      <TypedConfigInput config={cfg({ type: 'string' })} value="abc" onChange={() => {}} onCommit={onCommit} />,
    );
    const input = screen.getByDisplayValue('abc');
    input.focus();
    await user.keyboard('{Enter}');
    expect(onCommit).toHaveBeenCalled();
  });

  it('cancelled via Escape', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <TypedConfigInput config={cfg({ type: 'string' })} value="abc" onChange={() => {}} onCancel={onCancel} />,
    );
    screen.getByDisplayValue('abc').focus();
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('formatConfigValue', () => {
  it('boolean 1 renders as "enabled"', () => {
    expect(formatConfigValue(cfg({ type: 'boolean', value: '1' }))).toBe('enabled');
  });
  it('boolean 0 renders as "disabled"', () => {
    expect(formatConfigValue(cfg({ type: 'boolean', value: '0' }))).toBe('disabled');
  });
  it('passwords are masked with bullets', () => {
    expect(formatConfigValue(cfg({ type: 'password', value: 'secret123' }))).toBe('••••••••');
  });
  it('empty password renders as empty (caller decides placeholder)', () => {
    expect(formatConfigValue(cfg({ type: 'password', value: '' }))).toBe('');
  });
  it('strings, integers, etc render their raw value', () => {
    expect(formatConfigValue(cfg({ type: 'string', value: 'abc' }))).toBe('abc');
    expect(formatConfigValue(cfg({ type: 'integer', value: '42' }))).toBe('42');
  });
});

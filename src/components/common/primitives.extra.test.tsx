/**
 * Behaviour contract for the shared form/display primitives: each one has to
 * produce a real accessible name, wire its hint and error through
 * `aria-describedby`, and pass unknown props through to the native element.
 *
 * Deliberately one file for the whole set — these are leaf components with a
 * single behaviour each, and grouping them keeps the a11y contract in one
 * readable place.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { Badge } from './Badge';
import { Chip } from './Chip';
import { Panel } from './Panel';
import { Checkbox } from './Checkbox';
import { Select } from './Select';
import { TextField } from './TextField';
import { Textarea } from './Textarea';

describe('Badge', () => {
  it('renders its content and forwards native span props', () => {
    render(<Badge tone="danger" title="Capture process is down">DOWN</Badge>);
    const badge = screen.getByTitle('Capture process is down');
    expect(badge).toHaveTextContent('DOWN');
  });

  it('defaults to the neutral tone without extra props', () => {
    render(<Badge>Archived</Badge>);
    expect(screen.getByText('Archived')).toBeInTheDocument();
  });
});

describe('Chip', () => {
  it('is a toggle button that announces its state', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { rerender } = render(<Chip onClick={onClick}>Last hour</Chip>);

    const chip = screen.getByRole('button', { name: 'Last hour', pressed: false });
    await user.click(chip);
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(<Chip selected onClick={onClick}>Last hour</Chip>);
    expect(screen.getByRole('button', { name: 'Last hour' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('does not submit the surrounding form by default', () => {
    render(<Chip>Today</Chip>);
    expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute('type', 'button');
  });

  it('accepts an explicit submit type when a form wants one', () => {
    render(<Chip type="submit">Apply</Chip>);
    expect(screen.getByRole('button', { name: 'Apply' })).toHaveAttribute('type', 'submit');
  });
});

describe('Panel', () => {
  it('renders just its children when it has no header', () => {
    render(<Panel>Body text</Panel>);
    expect(screen.getByText('Body text')).toBeInTheDocument();
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('renders a heading, an icon and an action when given them', () => {
    render(
      <Panel
        title="System"
        icon={<span data-testid="panel-icon" />}
        action={<button type="button">Refresh</button>}
        noPadding
      >
        Body text
      </Panel>,
    );
    expect(screen.getByRole('heading', { name: 'System' })).toBeInTheDocument();
    expect(screen.getByTestId('panel-icon')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });
});

describe('Checkbox', () => {
  it('links a visible label to the box so clicking the text toggles it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Checkbox label="Include archived" onChange={onChange} />);

    const box = screen.getByRole('checkbox', { name: 'Include archived' });
    await user.click(screen.getByText('Include archived'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(box).toBeChecked();
  });

  it('renders bare when only an aria-label is supplied', () => {
    render(<Checkbox aria-label="Select Front Door" className="p-1" />);
    expect(screen.getByRole('checkbox', { name: 'Select Front Door' })).toBeInTheDocument();
    expect(screen.queryByText('Select Front Door')).toBeNull();
  });

  it('honours a caller-supplied id and a ref', () => {
    const ref = createRef<HTMLInputElement>();
    render(<Checkbox id="archived-box" label="Archived" ref={ref} disabled />);
    expect(screen.getByRole('checkbox', { name: 'Archived' })).toHaveAttribute('id', 'archived-box');
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
    expect(screen.getByRole('checkbox', { name: 'Archived' })).toBeDisabled();
  });
});

describe('TextField', () => {
  it('takes its accessible name from the visible label', async () => {
    const user = userEvent.setup();
    render(<TextField label="Monitor name" />);
    const input = screen.getByRole('textbox', { name: 'Monitor name' });
    await user.type(input, 'Front Door');
    expect(input).toHaveValue('Front Door');
  });

  it('describes the field with its hint', () => {
    render(<TextField label="Host" hint="IP address or hostname" />);
    const input = screen.getByRole('textbox', { name: 'Host' });
    expect(input).toHaveAccessibleDescription('IP address or hostname');
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('marks the field invalid and shows the error instead of the hint', () => {
    render(<TextField label="Host" hint="IP address or hostname" error="Host is required" />);
    const input = screen.getByRole('textbox', { name: 'Host' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Host is required');
    expect(screen.queryByText('IP address or hostname')).toBeNull();
  });

  it('works unlabelled with an aria-label and forwards a ref', () => {
    const ref = createRef<HTMLInputElement>();
    render(<TextField aria-label="Search monitors" size="sm" ref={ref} />);
    expect(screen.getByRole('textbox', { name: 'Search monitors' })).toBeInTheDocument();
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });
});

describe('Select', () => {
  it('labels the control and reports the chosen value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Select label="Function" defaultValue="Monitor" onChange={onChange}>
        <option value="None">None</option>
        <option value="Monitor">Monitor</option>
        <option value="Modect">Modect</option>
      </Select>,
    );
    const select = screen.getByRole('combobox', { name: 'Function' });
    expect(select).toHaveValue('Monitor');

    await user.selectOptions(select, 'Modect');
    expect(select).toHaveValue('Modect');
    expect(onChange).toHaveBeenCalled();
  });

  it('describes itself with a hint, and with the error once one is set', () => {
    const { rerender } = render(
      <Select label="Server" hint="Leave blank for the local server">
        <option value="">—</option>
      </Select>,
    );
    let select = screen.getByRole('combobox', { name: 'Server' });
    expect(select).toHaveAccessibleDescription('Leave blank for the local server');

    rerender(
      <Select label="Server" hint="Leave blank for the local server" error="Unknown server">
        <option value="">—</option>
      </Select>,
    );
    select = screen.getByRole('combobox', { name: 'Server' });
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveAccessibleDescription('Unknown server');
  });

  it('honours a caller id and a ref', () => {
    const ref = createRef<HTMLSelectElement>();
    render(
      <Select id="fn" size="sm" ref={ref} aria-label="Function">
        <option value="a">A</option>
      </Select>,
    );
    expect(screen.getByRole('combobox', { name: 'Function' })).toHaveAttribute('id', 'fn');
    expect(ref.current).toBeInstanceOf(HTMLSelectElement);
  });
});

describe('Textarea', () => {
  it('labels the control and defaults to three rows', async () => {
    const user = userEvent.setup();
    render(<Textarea label="Notes" />);
    const area = screen.getByRole('textbox', { name: 'Notes' });
    expect(area).toHaveAttribute('rows', '3');

    await user.type(area, 'Delivery van');
    expect(area).toHaveValue('Delivery van');
  });

  it('wires the hint, then swaps to the error', () => {
    const { rerender } = render(<Textarea label="Notes" hint="Optional" rows={6} />);
    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveAccessibleDescription('Optional');
    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveAttribute('rows', '6');

    rerender(<Textarea label="Notes" hint="Optional" error="Too long" fieldSize="sm" />);
    const area = screen.getByRole('textbox', { name: 'Notes' });
    expect(area).toHaveAttribute('aria-invalid', 'true');
    expect(area).toHaveAccessibleDescription('Too long');
  });

  it('forwards a ref', () => {
    const ref = createRef<HTMLTextAreaElement>();
    render(<Textarea aria-label="Notes" ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);
  });
});

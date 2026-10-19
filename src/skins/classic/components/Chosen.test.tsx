/**
 * Legacy's Chosen multi-select rebuilt: a box of chips plus a search field,
 * a drop of the options under it, and ZM's clear-all button. Stateless — the
 * caller owns the selection — so every expectation is on `onChange`.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { ClassicChosen } from './Chosen';

const options = [
  { value: 'None', label: 'None' },
  { value: 'Ondemand', label: 'On Demand' },
  { value: 'Always', label: 'Always' },
];
const onChange = vi.fn();

function mount(value: string[] = [], extra: Partial<Parameters<typeof ClassicChosen>[0]> = {}) {
  return renderWithProviders(
    <ClassicChosen label="Capturing" options={options} value={value} onChange={onChange} placeholder="All" {...extra} />,
  );
}

const box = () => screen.getByRole('combobox', { name: 'Capturing' });

beforeEach(() => onChange.mockClear());

describe('ClassicChosen', () => {
  it('shows the placeholder and no drop until opened', () => {
    mount();
    expect(box()).toHaveAttribute('placeholder', 'All');
    expect(box()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('opens on click and adds the clicked option to the selection', async () => {
    mount(['None']);
    await userEvent.click(box());
    const list = screen.getByRole('listbox', { name: 'Capturing' });
    expect(within(list).getAllByRole('option').map((o) => o.textContent)).toEqual(['None', 'On Demand', 'Always']);
    expect(within(list).getByRole('option', { name: 'None' })).toHaveAttribute('aria-selected', 'true');

    await userEvent.click(within(list).getByRole('option', { name: 'Always' }));
    expect(onChange).toHaveBeenCalledWith(['None', 'Always']);
    // Chosen closes the drop after a pick.
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('clicking an already picked option removes it', async () => {
    mount(['None', 'Always']);
    await userEvent.click(box());
    await userEvent.click(screen.getByRole('option', { name: 'None' }));
    expect(onChange).toHaveBeenCalledWith(['Always']);
  });

  it('renders a chip per picked value with its own remove button, and hides the placeholder', async () => {
    mount(['Ondemand']);
    expect(box()).not.toHaveAttribute('placeholder');
    expect(screen.getByText('On Demand')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove On Demand' }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('filters the drop by substring as the user types, with a no-results row', async () => {
    mount();
    await userEvent.type(box(), 'dem');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['On Demand']);
    await userEvent.type(box(), 'zz');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText('No results match "demzz"')).toBeInTheDocument();
  });

  it('walks the drop with the arrow keys and picks with Enter', async () => {
    mount();
    await userEvent.click(box());
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledWith(['Ondemand']);
  });

  it('skips picked options when walking with the keyboard', async () => {
    mount(['None']);
    await userEvent.click(box());
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith(['None', 'Ondemand']);
  });

  it('removes the last chip on Backspace in an empty search', async () => {
    mount(['None', 'Always']);
    await userEvent.click(box());
    await userEvent.keyboard('{Backspace}');
    expect(onChange).toHaveBeenCalledWith(['None']);
  });

  it('closes on Escape and on a click outside, dropping the search text', async () => {
    mount();
    await userEvent.type(box(), 'al');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(box()).toHaveValue('');

    await userEvent.type(box(), 'al');
    await userEvent.click(document.body);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(box()).toHaveValue('');
  });

  it('clears everything from the corner button, which is disabled when empty', async () => {
    mount();
    expect(screen.getByRole('button', { name: 'Clear capturing' })).toBeDisabled();
    mount(['None']);
    const clear = screen.getAllByRole('button', { name: 'Clear capturing' })[1];
    expect(clear).toBeEnabled();
    await userEvent.click(clear);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('can be rendered without the clear button', () => {
    mount([], { clearButton: false });
    expect(screen.queryByRole('button', { name: 'Clear capturing' })).not.toBeInTheDocument();
  });

  it('trims legacy\'s indent spaces off a chip label but keeps them in the drop', async () => {
    renderWithProviders(
      <ClassicChosen
        label="GroupId"
        options={[{ value: '1', label: 'Outside' }, { value: '2', label: '   Yard' }]}
        value={['2']}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('button', { name: 'Remove Yard' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('combobox', { name: 'GroupId' }));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Outside', '   Yard']);
  });

  it('leaves disabled options in the list but never picks them', async () => {
    renderWithProviders(
      <ClassicChosen
        label="Level"
        options={[{ value: 'a', label: 'A', disabled: true }, { value: 'b', label: 'B' }]}
        value={[]}
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Level' }));
    await userEvent.click(screen.getByRole('option', { name: 'A' }));
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith(['b']);
  });
});

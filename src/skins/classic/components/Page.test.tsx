/**
 * The classic page chrome (`ClassicPage` / `ClassicHeader`) plus the three
 * small control primitives that ship beside it: button, icon button,
 * toolbar and labelled select.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { renderWithProviders } from '@/test/render';

// The header renders a router <Link> for its back arrow.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: ReactNode; to?: string; [k: string]: unknown }) => (
    <a href={to ?? '#'} {...rest}>{children}</a>
  ),
}));

const { ClassicPage, ClassicHeader } = await import('./Page');
const { ClassicButton, ClassicIconButton } = await import('./Button');
const { ClassicToolbar } = await import('./Toolbar');
const { ClassicSelect, classicInputClass } = await import('./Select');
const { classicButtonClass } = await import('./buttonClass');

afterEach(() => { vi.restoreAllMocks(); });

describe('ClassicPage', () => {
  it('renders its children inside a main landmark', () => {
    renderWithProviders(<ClassicPage><p>body</p></ClassicPage>);
    expect(within(screen.getByRole('main')).getByText('body')).toBeInTheDocument();
  });

  it('accepts an extra className without dropping the children', () => {
    renderWithProviders(<ClassicPage className="extra"><p>body</p></ClassicPage>);
    expect(screen.getByText('body')).toBeInTheDocument();
  });
});

describe('ClassicHeader', () => {
  it('links the back arrow when backTo is given', () => {
    renderWithProviders(<ClassicHeader title="Monitor - 1 - Front Door" backTo="/" />);
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('heading', { name: 'Monitor - 1 - Front Door' })).toBeInTheDocument();
  });

  it('falls back to history.back() when no route is supplied', async () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    renderWithProviders(<ClassicHeader title="Zones" />);
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('omits the refresh square unless onRefresh is wired', () => {
    const { unmount } = renderWithProviders(<ClassicHeader title="Zones" />);
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull();
    unmount();

    const onRefresh = vi.fn();
    renderWithProviders(<ClassicHeader title="Zones" onRefresh={onRefresh} />);
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });

  it('calls onRefresh from the refresh square', async () => {
    const onRefresh = vi.fn();
    renderWithProviders(<ClassicHeader onRefresh={onRefresh} />);
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('renders inline children and the end cluster, and drops the title when absent', () => {
    renderWithProviders(
      <ClassicHeader end={<button type="button">Save</button>}>
        <span>inline</span>
      </ClassicHeader>,
    );
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByText('inline')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });
});

describe('ClassicButton', () => {
  it('defaults to type=button so it never submits a surrounding form', () => {
    renderWithProviders(<ClassicButton>Add</ClassicButton>);
    expect(screen.getByRole('button', { name: 'Add' })).toHaveAttribute('type', 'button');
  });

  it('renders the leading icon as decoration only', () => {
    renderWithProviders(
      <ClassicButton icon={<svg data-testid="icon" />} tone="primary">Clone</ClassicButton>,
    );
    // The accessible name is the label alone — the icon wrapper is aria-hidden.
    expect(screen.getByRole('button', { name: 'Clone' })).toBeInTheDocument();
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('does not fire onClick while disabled', async () => {
    const onClick = vi.fn();
    renderWithProviders(<ClassicButton disabled tone="danger" size="sm" onClick={onClick}>Delete</ClassicButton>);
    const btn = screen.getByRole('button', { name: 'Delete' });
    expect(btn).toBeDisabled();
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('honours an explicit submit type', () => {
    renderWithProviders(<ClassicButton type="submit">Go</ClassicButton>);
    expect(screen.getByRole('button', { name: 'Go' })).toHaveAttribute('type', 'submit');
  });
});

describe('ClassicIconButton', () => {
  it('uses aria-label as both name and default tooltip', () => {
    renderWithProviders(<ClassicIconButton aria-label="Refresh"><svg /></ClassicIconButton>);
    expect(screen.getByRole('button', { name: 'Refresh' })).toHaveAttribute('title', 'Refresh');
  });

  it('lets an explicit title win over the label', async () => {
    const onClick = vi.fn();
    renderWithProviders(
      <ClassicIconButton aria-label="Columns" title="Choose columns" onClick={onClick}><svg /></ClassicIconButton>,
    );
    const btn = screen.getByRole('button', { name: 'Columns' });
    expect(btn).toHaveAttribute('title', 'Choose columns');
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('ClassicToolbar', () => {
  it('names the toolbar landmark and renders both slots', () => {
    renderWithProviders(
      <ClassicToolbar label="Console actions" end={<button type="button">Export</button>}>
        <button type="button">Add</button>
      </ClassicToolbar>,
    );
    const bar = screen.getByRole('toolbar', { name: 'Console actions' });
    expect(within(bar).getByRole('button', { name: 'Add' })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Export' })).toBeInTheDocument();
  });

  it('omits the end cluster when nothing is passed', () => {
    renderWithProviders(
      <ClassicToolbar label="Empty"><span>only</span></ClassicToolbar>,
    );
    const bar = screen.getByRole('toolbar', { name: 'Empty' });
    expect(within(bar).getByText('only')).toBeInTheDocument();
    expect(within(bar).queryByRole('button')).toBeNull();
  });
});

describe('ClassicSelect', () => {
  const options = [
    { value: 'auto', label: 'auto' },
    { value: '640px', label: '640px' },
    { value: 'gone', label: 'gone', disabled: true },
  ];

  it('reports the chosen value through onChange', async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <ClassicSelect label="Width" value="auto" onChange={onChange} options={options} />,
    );
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Width' }), '640px');
    expect(onChange).toHaveBeenCalledWith('640px');
  });

  it('marks disabled options and forwards native select attributes', () => {
    renderWithProviders(
      <ClassicSelect
        label="Width"
        value="auto"
        onChange={() => {}}
        options={options}
        stacked
        selectClassName="w-20"
        disabled
      />,
    );
    const select = screen.getByRole('combobox', { name: 'Width' });
    expect(select).toBeDisabled();
    expect(within(select).getByRole('option', { name: 'gone' })).toBeDisabled();
  });
});

describe('class recipes', () => {
  it('vary by tone and size but always return a string', () => {
    const tones = ['primary', 'default', 'danger', 'link'] as const;
    const recipes = tones.map((tone) => classicButtonClass(tone, 'sm', 'extra'));
    expect(new Set(recipes).size).toBe(tones.length);
    expect(classicButtonClass()).toContain('inline-flex');
    expect(typeof classicInputClass).toBe('string');
  });
});

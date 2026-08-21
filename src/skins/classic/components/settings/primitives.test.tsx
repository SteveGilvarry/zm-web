/**
 * Flat-Bootstrap primitives behind the classic Options pages, plus the
 * left-hand `OptionsRail` that switches between config categories.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { renderWithProviders } from '@/test/render';

// OptionsRail links with the router; render them as plain anchors.
const linkSearch = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, search, ...rest }: {
    children: ReactNode; to?: string;
    search?: unknown; [k: string]: unknown;
  }) => {
    if (typeof search === 'function') linkSearch(search({ page: 2 }));
    return <a href={to ?? '#'} {...rest}>{children}</a>;
  },
}));

const {
  ClassicButton, ClassicToolbar, ClassicSearch, ClassicTable, ClassicSortTh, YesNo,
  classicTh, classicTd, classicLink, classicInput,
} = await import('./primitives');
const { OptionsRail } = await import('./OptionsRail');
const { DISPLAY_TAB } = await import('@/features/settings/optionsTabs');
type OptionsTab = import('@/features/settings/optionsTabs').OptionsTab;

describe('settings ClassicButton', () => {
  it('defaults to a non-submitting button', () => {
    renderWithProviders(<ClassicButton>Save</ClassicButton>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button');
  });

  it('fires onClick for each tone', async () => {
    const onClick = vi.fn();
    renderWithProviders(
      <>
        <ClassicButton tone="primary" onClick={onClick}>Apply</ClassicButton>
        <ClassicButton tone="danger" onClick={onClick}>Delete</ClassicButton>
        <ClassicButton tone="default" onClick={onClick}>Cancel</ClassicButton>
      </>,
    );
    for (const name of ['Apply', 'Delete', 'Cancel']) {
      await userEvent.click(screen.getByRole('button', { name }));
    }
    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it('swallows clicks while disabled', async () => {
    const onClick = vi.fn();
    renderWithProviders(<ClassicButton disabled onClick={onClick}>Apply</ClassicButton>);
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('settings ClassicToolbar', () => {
  it('renders the end cluster only when given one', () => {
    const { unmount } = renderWithProviders(
      <ClassicToolbar end={<span>right</span>}><span>left</span></ClassicToolbar>,
    );
    expect(screen.getByText('left')).toBeInTheDocument();
    expect(screen.getByText('right')).toBeInTheDocument();
    unmount();

    renderWithProviders(<ClassicToolbar><span>left</span></ClassicToolbar>);
    expect(screen.queryByText('right')).toBeNull();
  });
});

describe('ClassicSearch', () => {
  it('defaults its label and placeholder to "Search"', () => {
    renderWithProviders(<ClassicSearch value="" onChange={() => {}} />);
    const input = screen.getByRole('searchbox', { name: 'Search' });
    expect(input).toHaveAttribute('placeholder', 'Search');
  });

  it('uses a custom placeholder as the accessible name and reports typing', async () => {
    const onChange = vi.fn();
    renderWithProviders(<ClassicSearch value="" onChange={onChange} placeholder="Find option" />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Find option' }), 'z');
    expect(onChange).toHaveBeenCalledWith('z');
  });
});

describe('ClassicTable + ClassicSortTh', () => {
  function mountTable(active: boolean, dir: 'asc' | 'desc', onClick = vi.fn()) {
    renderWithProviders(
      <ClassicTable aria-label="Options">
        <thead>
          <tr>
            <ClassicSortTh active={active} dir={dir} onClick={onClick}>Name</ClassicSortTh>
            <th scope="col" className={classicTh}>Value</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className={classicTd}><a className={classicLink} href="#x">ZM_OPT_X10</a></td>
            <td className={classicTd}><input className={classicInput} aria-label="Value" defaultValue="1" /></td>
          </tr>
        </tbody>
      </ClassicTable>,
    );
    return onClick;
  }

  it('names the table and reads "none" while another column sorts', () => {
    mountTable(false, 'asc');
    expect(screen.getByRole('table', { name: 'Options' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute('aria-sort', 'none');
  });

  it('reports the active direction both ways', () => {
    const { unmount } = renderWithProviders(
      <table><thead><tr>
        <ClassicSortTh active dir="asc" onClick={() => {}}>Name</ClassicSortTh>
      </tr></thead></table>,
    );
    expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute('aria-sort', 'ascending');
    unmount();

    renderWithProviders(
      <table><thead><tr>
        <ClassicSortTh active dir="desc" onClick={() => {}}>Name</ClassicSortTh>
      </tr></thead></table>,
    );
    expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute('aria-sort', 'descending');
  });

  it('calls onClick from the header button', async () => {
    const onClick = mountTable(true, 'desc');
    await userEvent.click(screen.getByRole('button', { name: 'Name' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('YesNo', () => {
  it('maps the legacy 0/1 capability columns onto words', () => {
    renderWithProviders(
      <ul>
        <li>on: <YesNo value={1} /></li>
        <li>off: <YesNo value={0} /></li>
        <li>missing: <YesNo value={null} /></li>
        <li>undef: <YesNo value={undefined} /></li>
      </ul>,
    );
    expect(screen.getByText('on: Yes')).toBeInTheDocument();
    expect(screen.getByText('off: No')).toBeInTheDocument();
    expect(screen.getByText('missing: No')).toBeInTheDocument();
    expect(screen.getByText('undef: No')).toBeInTheDocument();
  });
});

describe('OptionsRail', () => {
  const tabs: OptionsTab[] = [
    { kind: 'page', key: DISPLAY_TAB, to: '/settings' },
    { kind: 'category', key: 'system', category: 'system' },
    { kind: 'category', key: 'mqtt', category: 'MQTT' },
    { kind: 'page', key: 'servers', to: '/settings/servers' },
  ];

  it('links every tab and marks the active one when there is no in-place handler', () => {
    linkSearch.mockClear();
    renderWithProviders(<OptionsRail tabs={tabs} active="system" />);
    const nav = screen.getByRole('navigation', { name: 'Options' });

    expect(within(nav).getByRole('link', { name: 'Display' })).toHaveAttribute('href', '/settings');
    expect(within(nav).getByRole('link', { name: 'Servers' })).toHaveAttribute('href', '/settings/servers');
    expect(within(nav).getByRole('link', { name: 'System' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'MQTT' })).not.toHaveAttribute('aria-current');

    // Category tabs keep the rest of the search params and set `category`.
    expect(linkSearch).toHaveBeenCalledWith({ page: 2, category: 'system' });
    expect(linkSearch).toHaveBeenCalledWith({ page: 2, category: 'MQTT' });
    expect(linkSearch).toHaveBeenCalledWith({ page: 2, category: 'display' });
  });

  it('switches categories in place, passing the backend spelling', async () => {
    const onSelectCategory = vi.fn();
    renderWithProviders(<OptionsRail tabs={tabs} active={null} onSelectCategory={onSelectCategory} />);

    await userEvent.click(screen.getByRole('button', { name: 'MQTT' }));
    expect(onSelectCategory).toHaveBeenLastCalledWith('MQTT');

    await userEvent.click(screen.getByRole('button', { name: 'Display' }));
    expect(onSelectCategory).toHaveBeenLastCalledWith('display');

    // Sub-page tabs still navigate.
    expect(screen.getByRole('link', { name: 'Servers' })).toHaveAttribute('href', '/settings/servers');
  });

  it('falls back to the raw key for a category the label table does not know', () => {
    renderWithProviders(
      <OptionsRail tabs={[{ kind: 'category', key: 'weird', category: 'Weird' }]} active="weird" />,
    );
    expect(screen.getByRole('link', { name: 'weird' })).toHaveAttribute('aria-current', 'page');
  });
});

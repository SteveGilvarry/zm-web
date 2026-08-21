/**
 * Classic table primitives: the bootstrap-table shell plus the sortable
 * header cell that carries `aria-sort` for assistive tech.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import {
  ClassicTable, ClassicTd, ClassicTfoot, ClassicTh, ClassicThead, classicLinkClass,
} from './Table';

function renderTable(head: React.ReactNode, body?: React.ReactNode, foot?: React.ReactNode) {
  return renderWithProviders(
    <ClassicTable aria-label="Monitors" data-testid="t">
      <ClassicThead>
        <tr>{head}</tr>
      </ClassicThead>
      {body && <tbody><tr>{body}</tr></tbody>}
      {foot && <ClassicTfoot><tr>{foot}</tr></ClassicTfoot>}
    </ClassicTable>,
  );
}

describe('ClassicTable', () => {
  it('forwards the accessible name and arbitrary table attributes', () => {
    renderTable(<ClassicTh>Name</ClassicTh>);
    const table = screen.getByRole('table', { name: 'Monitors' });
    expect(table).toBe(screen.getByTestId('t'));
    expect(within(table).getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
  });

  it('renders a footer section alongside the head and body', () => {
    renderTable(
      <ClassicTh>Name</ClassicTh>,
      <ClassicTd>Front Door</ClassicTd>,
      <ClassicTd numeric>42</ClassicTd>,
    );
    expect(screen.getByRole('cell', { name: 'Front Door' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '42' })).toBeInTheDocument();
  });
});

describe('ClassicTh', () => {
  it('is a plain header — no button, no aria-sort — when onSort is omitted', () => {
    renderTable(<ClassicTh numeric>Events</ClassicTh>);
    const th = screen.getByRole('columnheader', { name: 'Events' });
    expect(th).not.toHaveAttribute('aria-sort');
    expect(within(th).queryByRole('button')).toBeNull();
  });

  it('renders a sort button reading aria-sort="none" while another column sorts', () => {
    renderTable(<ClassicTh onSort={() => {}}>Name</ClassicTh>);
    expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute('aria-sort', 'none');
    expect(screen.getByRole('button', { name: 'Name' })).toBeInTheDocument();
  });

  it('reports ascending and descending for the active column', () => {
    const { unmount } = renderTable(<ClassicTh onSort={() => {}} sortActive sortDir="asc">Id</ClassicTh>);
    expect(screen.getByRole('columnheader', { name: 'Id' })).toHaveAttribute('aria-sort', 'ascending');
    unmount();

    renderTable(<ClassicTh onSort={() => {}} sortActive sortDir="desc" numeric>Id</ClassicTh>);
    expect(screen.getByRole('columnheader', { name: 'Id' })).toHaveAttribute('aria-sort', 'descending');
  });

  it('calls onSort when the header button is clicked', async () => {
    const onSort = vi.fn();
    renderTable(<ClassicTh onSort={onSort}>Sequence</ClassicTh>);
    await userEvent.click(screen.getByRole('button', { name: 'Sequence' }));
    expect(onSort).toHaveBeenCalledTimes(1);
  });
});

describe('classicLinkClass', () => {
  it('is exported for pages that style their own anchors', () => {
    expect(typeof classicLinkClass).toBe('string');
    expect(classicLinkClass.length).toBeGreaterThan(0);
  });
});

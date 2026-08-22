/**
 * bootstrap-table footer: the "Showing X to Y of Z rows" count, the
 * rows-per-page select and the numbered page list.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { ClassicPagination } from './Pagination';
import { PAGE_SIZE_ALL } from './paginationMath';

describe('ClassicPagination', () => {
  it('reports the row window for the current page', () => {
    renderWithProviders(
      <ClassicPagination page={2} pageSize={25} total={120} onPage={() => {}} />,
    );
    expect(screen.getByText('Showing 26 to 50 of 120 rows')).toBeInTheDocument();
  });

  it('shows a zero window when there are no rows and hides the page list', () => {
    renderWithProviders(
      <ClassicPagination page={1} pageSize={25} total={0} onPage={() => {}} />,
    );
    expect(screen.getByText('Showing 0 to 0 of 0 rows')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).toBeNull();
  });

  it('omits the rows-per-page select unless onPageSize is wired', () => {
    const { unmount } = renderWithProviders(
      <ClassicPagination page={1} pageSize={25} total={30} onPage={() => {}} />,
    );
    expect(screen.queryByRole('combobox', { name: 'Rows per page' })).toBeNull();
    unmount();

    renderWithProviders(
      <ClassicPagination page={1} pageSize={25} total={30} onPage={() => {}} onPageSize={() => {}} />,
    );
    expect(screen.getByRole('combobox', { name: 'Rows per page' })).toBeInTheDocument();
  });

  it('reports the new page size as a number, including the All sentinel', async () => {
    const onPageSize = vi.fn();
    renderWithProviders(
      <ClassicPagination
        page={1} pageSize={25} total={300}
        onPage={() => {}} onPageSize={onPageSize}
        pageSizeOptions={[10, 25, 50]}
      />,
    );
    const select = screen.getByRole('combobox', { name: 'Rows per page' });
    expect(within(select).getAllByRole('option').map((o) => o.textContent))
      .toEqual(['10', '25', '50', 'All']);

    await userEvent.selectOptions(select, '50');
    expect(onPageSize).toHaveBeenLastCalledWith(50);

    await userEvent.selectOptions(select, String(PAGE_SIZE_ALL));
    expect(onPageSize).toHaveBeenLastCalledWith(PAGE_SIZE_ALL);
  });

  it('shows every page when there are few, and marks the current one', async () => {
    const onPage = vi.fn();
    renderWithProviders(
      <ClassicPagination page={2} pageSize={10} total={30} onPage={onPage} />,
    );
    const nav = screen.getByRole('navigation', { name: 'Pagination' });
    expect(within(nav).getByRole('button', { name: '2' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('button', { name: '1' })).not.toHaveAttribute('aria-current');

    await userEvent.click(within(nav).getByRole('button', { name: '3' }));
    expect(onPage).toHaveBeenCalledWith(3);
  });

  it('steps with the previous / next arrows and disables them at the ends', async () => {
    const onPage = vi.fn();
    const { unmount } = renderWithProviders(
      <ClassicPagination page={1} pageSize={10} total={30} onPage={onPage} />,
    );
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(onPage).toHaveBeenCalledWith(2);
    unmount();

    renderWithProviders(
      <ClassicPagination page={3} pageSize={10} total={30} onPage={onPage} />,
    );
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(onPage).toHaveBeenLastCalledWith(2);
  });

  it('elides the middle of a long page list', () => {
    renderWithProviders(
      <ClassicPagination page={10} pageSize={10} total={200} onPage={() => {}} />,
    );
    const nav = screen.getByRole('navigation', { name: 'Pagination' });
    const numbered = within(nav).getAllByRole('button')
      .map((b) => b.textContent)
      .filter((txt) => txt !== '‹' && txt !== '›');
    expect(numbered).toEqual(['1', '9', '10', '11', '20']);
    expect(within(nav).getAllByText('…')).toHaveLength(2);
  });

  it('collapses to a single page when the size is All', () => {
    renderWithProviders(
      <ClassicPagination page={1} pageSize={PAGE_SIZE_ALL} total={91} onPage={() => {}} onPageSize={() => {}} />,
    );
    expect(screen.getByText('Showing 1 to 91 of 91 rows')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).toBeNull();
  });
});

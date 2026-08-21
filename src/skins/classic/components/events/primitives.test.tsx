/**
 * Classic Events/Filters/Logs/Reports primitives — the parts the page
 * tests do not reach: the anchor-as-button, the clearable filter input,
 * the non-sortable header variants and the bootstrap-table pager with its
 * jump-to-page form.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import {
  ClassicButton, ClassicClearableInput, ClassicFilterField, ClassicLinkButton, ClassicPageTitle,
  ClassicPager, ClassicTable, ClassicTbody, ClassicTd, ClassicTh, ClassicThead, ClassicToolbar,
} from './primitives';

describe('ClassicButton', () => {
  it('renders every tone and size, and blocks clicks while disabled', async () => {
    const onClick = vi.fn();
    renderWithProviders(
      <>
        <ClassicButton tone="primary" size="sm" onClick={onClick}>Apply</ClassicButton>
        <ClassicButton tone="success" onClick={onClick}>Archive</ClassicButton>
        <ClassicButton tone="danger" onClick={onClick}>Delete</ClassicButton>
        <ClassicButton disabled onClick={onClick}>Export</ClassicButton>
      </>,
    );
    for (const name of ['Apply', 'Archive', 'Delete', 'Export']) {
      await userEvent.click(screen.getByRole('button', { name }));
    }
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
    expect(onClick).toHaveBeenCalledTimes(3);
  });
});

describe('ClassicLinkButton', () => {
  it('is an anchor that keeps its href and download attributes', () => {
    renderWithProviders(
      <ClassicLinkButton tone="primary" href="/api/v3/events/9/export" download="event-9.zip">
        Download
      </ClassicLinkButton>,
    );
    const link = screen.getByRole('link', { name: 'Download' });
    expect(link).toHaveAttribute('href', '/api/v3/events/9/export');
    expect(link).toHaveAttribute('download', 'event-9.zip');
  });

  it('defaults to the neutral tone', () => {
    renderWithProviders(<ClassicLinkButton href="#x">Plain</ClassicLinkButton>);
    expect(screen.getByRole('link', { name: 'Plain' })).toBeInTheDocument();
  });
});

describe('ClassicToolbar', () => {
  it('renders the end cluster only when supplied', () => {
    const { unmount } = renderWithProviders(
      <ClassicToolbar className="mb-2" end={<span>right</span>}><span>left</span></ClassicToolbar>,
    );
    expect(screen.getByText('right')).toBeInTheDocument();
    unmount();

    renderWithProviders(<ClassicToolbar><span>left</span></ClassicToolbar>);
    expect(screen.getByText('left')).toBeInTheDocument();
    expect(screen.queryByText('right')).toBeNull();
  });
});

describe('ClassicFilterField', () => {
  it('ties its label to the control it wraps', () => {
    renderWithProviders(
      <ClassicFilterField label="Monitor" htmlFor="mon" className="w-40">
        <select id="mon" defaultValue=""><option value="">All</option></select>
      </ClassicFilterField>,
    );
    expect(screen.getByRole('combobox', { name: 'Monitor' })).toBeInTheDocument();
  });
});

describe('ClassicClearableInput', () => {
  it('hides the clear affordance while empty', () => {
    renderWithProviders(
      <ClassicClearableInput value="" onChange={() => {}} ariaLabel="Notes" placeholder="substring" />,
    );
    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveAttribute('placeholder', 'substring');
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
  });

  it('reports typing and clears back to an empty string', async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <ClassicClearableInput id="notes" value="cat" onChange={onChange} ariaLabel="Notes" />,
    );
    await userEvent.type(screen.getByRole('textbox', { name: 'Notes' }), 'x');
    expect(onChange).toHaveBeenLastCalledWith('catx');

    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('honours a non-text input type', () => {
    renderWithProviders(
      <ClassicClearableInput type="datetime-local" value="" onChange={() => {}} ariaLabel="Start" />,
    );
    expect(screen.getByLabelText('Start')).toHaveAttribute('type', 'datetime-local');
  });
});

describe('table cells', () => {
  it('renders plain, numeric and centred header and body cells', () => {
    renderWithProviders(
      <ClassicTable testId="events">
        <ClassicThead>
          <tr>
            <ClassicTh>Name</ClassicTh>
            <ClassicTh numeric>Score</ClassicTh>
            <ClassicTh center>Archived</ClassicTh>
          </tr>
        </ClassicThead>
        <ClassicTbody>
          <tr>
            <ClassicTd>Event 1</ClassicTd>
            <ClassicTd numeric>91</ClassicTd>
            <ClassicTd center>Yes</ClassicTd>
          </tr>
        </ClassicTbody>
      </ClassicTable>,
    );
    const table = screen.getByTestId('events');
    for (const name of ['Name', 'Score', 'Archived']) {
      const th = within(table).getByRole('columnheader', { name });
      expect(th).not.toHaveAttribute('aria-sort');
    }
    expect(within(table).getByRole('cell', { name: 'Event 1' })).toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: '91' })).toBeInTheDocument();
  });

  it('turns a sortable header into a button carrying aria-sort', async () => {
    const onSort = vi.fn();
    const { unmount } = renderWithProviders(
      <table><thead><tr>
        <ClassicTh sortable active dir="asc" onSort={onSort}>Time</ClassicTh>
        <ClassicTh sortable active={false} dir="asc" onSort={onSort}>Monitor</ClassicTh>
      </tr></thead></table>,
    );
    expect(screen.getByRole('columnheader', { name: 'Time' })).toHaveAttribute('aria-sort', 'ascending');
    expect(screen.getByRole('columnheader', { name: 'Monitor' })).toHaveAttribute('aria-sort', 'none');
    await userEvent.click(screen.getByRole('button', { name: 'Time' }));
    expect(onSort).toHaveBeenCalledTimes(1);
    unmount();

    renderWithProviders(
      <table><thead><tr>
        <ClassicTh sortable active dir="desc" onSort={onSort}>Time</ClassicTh>
      </tr></thead></table>,
    );
    expect(screen.getByRole('columnheader', { name: 'Time' })).toHaveAttribute('aria-sort', 'descending');
  });
});

describe('ClassicPager', () => {
  const base = {
    page: 1, pageSize: 25, total: 0, totalPages: 1,
    pageSizeOptions: [10, 25, 50] as const,
    onPage: () => {}, onPageSize: () => {},
  };

  it('shows a zero window and no page list when there is nothing to page', () => {
    renderWithProviders(<ClassicPager {...base} />);
    expect(screen.getByText('Showing 0 to 0 of 0 rows')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next page' })).toBeNull();
  });

  it('counts a partly-filled page from the rows actually shown', () => {
    renderWithProviders(<ClassicPager {...base} page={2} total={91} totalPages={4} shown={16} />);
    expect(screen.getByText('Showing 26 to 41 of 91 rows')).toBeInTheDocument();
  });

  it('reports a new page size as a number', async () => {
    const onPageSize = vi.fn();
    renderWithProviders(<ClassicPager {...base} total={91} totalPages={4} onPageSize={onPageSize} />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Rows per page' }), '50');
    expect(onPageSize).toHaveBeenCalledWith(50);
  });

  it('steps and jumps between pages, disabling the arrows at the ends', async () => {
    const onPage = vi.fn();
    const { unmount } = renderWithProviders(
      <ClassicPager {...base} page={1} total={91} totalPages={4} onPage={onPage} />,
    );
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(onPage).toHaveBeenLastCalledWith(2);

    await userEvent.click(screen.getByRole('button', { name: 'Go to page 3' }));
    expect(onPage).toHaveBeenLastCalledWith(3);
    expect(screen.getByRole('button', { name: 'Go to page 1' })).toHaveAttribute('aria-current', 'page');
    unmount();

    renderWithProviders(<ClassicPager {...base} page={4} total={91} totalPages={4} onPage={onPage} />);
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(onPage).toHaveBeenLastCalledWith(3);
  });

  it('elides the middle of a long page list', () => {
    renderWithProviders(<ClassicPager {...base} page={10} total={500} totalPages={20} />);
    expect(screen.getAllByText('…')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Go to page 20' })).toBeInTheDocument();
  });

  it('jumps to a valid page number on submit', async () => {
    const onPage = vi.fn();
    renderWithProviders(<ClassicPager {...base} page={1} total={91} totalPages={4} onPage={onPage} />);
    const box = screen.getByRole('spinbutton', { name: 'Jump to page' });
    await userEvent.clear(box);
    await userEvent.type(box, '3');
    await userEvent.click(screen.getByRole('button', { name: 'GO' }));
    expect(onPage).toHaveBeenCalledWith(3);
  });

  it('snaps an unusable entry back to the current page', async () => {
    const onPage = vi.fn();
    renderWithProviders(<ClassicPager {...base} page={2} total={91} totalPages={4} onPage={onPage} />);
    const box = screen.getByRole('spinbutton', { name: 'Jump to page' });
    await userEvent.clear(box);
    await userEvent.click(screen.getByRole('button', { name: 'GO' }));
    expect(onPage).not.toHaveBeenCalled();
    expect(box).toHaveValue(2);
  });

  it('clamps an out-of-range jump to the last page (legacy GO behaviour)', async () => {
    const onPage = vi.fn();
    renderWithProviders(<ClassicPager {...base} page={2} total={91} totalPages={4} onPage={onPage} />);
    const box = screen.getByRole('spinbutton', { name: 'Jump to page' }) as HTMLInputElement;
    await userEvent.clear(box);
    await userEvent.type(box, '99');
    // No `max` attribute: it would make the browser block submit and GO
    // would look dead instead of taking you to the last page.
    expect(box).not.toHaveAttribute('max');

    await userEvent.click(screen.getByRole('button', { name: 'GO' }));
    expect(onPage).toHaveBeenCalledWith(4);
  });

  it('clamps a jump below the first page', async () => {
    const onPage = vi.fn();
    renderWithProviders(<ClassicPager {...base} page={2} total={91} totalPages={4} onPage={onPage} />);
    const box = screen.getByRole('spinbutton', { name: 'Jump to page' });
    await userEvent.clear(box);
    await userEvent.type(box, '0');
    await userEvent.click(screen.getByRole('button', { name: 'GO' }));
    expect(onPage).toHaveBeenCalledWith(1);
  });

  it('ignores a jump to the page already shown', async () => {
    const onPage = vi.fn();
    renderWithProviders(<ClassicPager {...base} page={2} total={91} totalPages={4} onPage={onPage} />);
    await userEvent.click(screen.getByRole('button', { name: 'GO' }));
    expect(onPage).not.toHaveBeenCalled();
  });

  it('resyncs the jump box when the page changes underneath it', () => {
    const { rerender } = renderWithProviders(
      <ClassicPager {...base} page={1} total={91} totalPages={4} />,
    );
    rerender(<ClassicPager {...base} page={3} total={91} totalPages={4} />);
    expect(screen.getByRole('spinbutton', { name: 'Jump to page' })).toHaveValue(3);
  });
});

describe('ClassicPageTitle', () => {
  it('renders a heading plus an optional action slot', () => {
    const { unmount } = renderWithProviders(
      <ClassicPageTitle actions={<button type="button">New</button>}>Events</ClassicPageTitle>,
    );
    expect(screen.getByRole('heading', { name: 'Events' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();
    unmount();

    renderWithProviders(<ClassicPageTitle>Filters</ClassicPageTitle>);
    expect(screen.getByRole('heading', { name: 'Filters' })).toBeInTheDocument();
  });
});

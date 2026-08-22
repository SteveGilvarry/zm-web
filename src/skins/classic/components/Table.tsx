import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { clsx } from 'clsx';
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';

/**
 * Legacy bootstrap-table look: white, 1px zinc borders, grey-blue header,
 * striped rows, blue links. The wrapper scrolls horizontally so a wide
 * table never widens the page (mobile).
 */
export function ClassicTable({ className, children, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto bg-white border border-zinc-300 rounded-sm">
      <table
        className={clsx(
          'w-full text-sm text-zinc-800 border-collapse',
          '[&_tbody_tr:nth-child(even)]:bg-zinc-50 [&_tbody_tr:hover]:bg-[#e8f1f8]',
          '[&_td]:border-t [&_td]:border-zinc-200',
          className,
        )}
        {...rest}
      >
        {children}
      </table>
    </div>
  );
}

export function ClassicThead({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={clsx('bg-[#dde3e9] text-zinc-800', className)} {...rest} />;
}

export function ClassicTfoot({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tfoot className={clsx('bg-white font-semibold border-t-2 border-zinc-300', className)} {...rest} />;
}

export type SortDir = 'asc' | 'desc';

interface ClassicThProps extends Omit<ThHTMLAttributes<HTMLTableCellElement>, 'onClick'> {
  numeric?: boolean;
  /** Makes the header a sort button. */
  onSort?: () => void;
  /** This column drives the current sort. */
  sortActive?: boolean;
  sortDir?: SortDir;
  children?: ReactNode;
}

/**
 * Header cell. Sortable columns render a `<button>` inside and carry
 * `aria-sort` so assistive tech reads the active order.
 */
export function ClassicTh({
  numeric, onSort, sortActive = false, sortDir = 'asc', className, children, ...rest
}: ClassicThProps) {
  const ariaSort = onSort
    ? sortActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'
    : undefined;
  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={clsx(
        'px-3 py-2 font-semibold text-[13px] whitespace-nowrap align-middle',
        numeric ? 'text-end' : 'text-start',
        className,
      )}
      {...rest}
    >
      {onSort ? (
        <button
          type="button"
          onClick={onSort}
          className={clsx(
            'inline-flex items-center gap-1 hover:underline',
            numeric && 'flex-row-reverse',
            sortActive && 'text-[#337ab7]',
          )}
        >
          {children}
          {sortActive
            ? (sortDir === 'asc' ? <ChevronUp size={12} aria-hidden /> : <ChevronDown size={12} aria-hidden />)
            : <ChevronsUpDown size={12} aria-hidden className="text-zinc-400" />}
        </button>
      ) : children}
    </th>
  );
}

export function ClassicTd({
  numeric, className, ...rest
}: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td
      className={clsx('px-3 py-2 align-middle', numeric && 'text-end tabular-nums', className)}
      {...rest}
    />
  );
}

/** Legacy `#337ab7` anchor recipe, for `<Link>` and `<a>`. */
export const classicLinkClass = 'text-[#337ab7] hover:underline hover:text-[#23527c]';

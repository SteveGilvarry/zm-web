import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode, type ThHTMLAttributes } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';

/**
 * Flat-Bootstrap primitives for the classic skin's Events / Filters / Logs /
 * Reports pages: white striped tables, `#337ab7` links, square grey
 * buttons, label-above filter fields and the bootstrap-table footer
 * ("Showing 1 to 25 of 91 rows", rows-per-page, numbered pages, jump-to).
 * Intentionally one file so it can be merged into the shared classic
 * component set in one move.
 */

import { classicInput, classicSelect } from './styles';
import { pageNumbers } from './pageNumbers';

type Tone = 'default' | 'primary' | 'danger' | 'success';

const TONE: Record<Tone, string> = {
  default: 'bg-[#e9ecef] border-[#adb5bd] text-zinc-800 hover:bg-[#dde1e5]',
  primary: 'bg-[#337ab7] border-[#2e6da4] text-white hover:bg-[#286090]',
  danger: 'bg-[#d9534f] border-[#d43f3a] text-white hover:bg-[#c9302c]',
  success: 'bg-[#5cb85c] border-[#4cae4c] text-white hover:bg-[#449d44]',
};

export function ClassicButton({
  tone = 'default', size = 'md', className, children, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      {...rest}
      className={clsx(
        'inline-flex items-center gap-1.5 border rounded-sm font-medium whitespace-nowrap',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1.5 text-sm',
        TONE[tone],
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Anchor styled as a button (downloads, external links). */
export function ClassicLinkButton({
  tone = 'default', className, children, ...rest
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { tone?: Tone }) {
  return (
    <a
      {...rest}
      className={clsx(
        'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-sm font-medium whitespace-nowrap',
        TONE[tone],
        className,
      )}
    >
      {children}
    </a>
  );
}

export function ClassicToolbar({ children, className, end }: { children: ReactNode; className?: string; end?: ReactNode }) {
  return (
    <div className={clsx('flex flex-wrap items-center justify-between gap-2', className)}>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
      {end && <div className="flex flex-wrap items-center gap-1.5">{end}</div>}
    </div>
  );
}

/** Legacy filter-bar field: centred label above the control. */
export function ClassicFilterField({ label, htmlFor, children, className }: {
  label: ReactNode; htmlFor?: string; children: ReactNode; className?: string;
}) {
  return (
    <div className={clsx('flex flex-col items-stretch gap-0.5 text-sm', className)}>
      <label htmlFor={htmlFor} className="text-center text-xs text-zinc-700 whitespace-nowrap">{label}</label>
      {children}
    </div>
  );
}

/** Text input with the legacy clear (×) affordance. */
export function ClassicClearableInput({
  value, onChange, id, placeholder, type = 'text', ariaLabel, className,
}: {
  value: string; onChange: (v: string) => void; id?: string; placeholder?: string;
  type?: string; ariaLabel?: string; className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={clsx('relative', className)}>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        className={clsx(classicInput, 'w-full pe-7')}
      />
      {value !== '' && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label={t('Clear')}
          className="absolute end-1 top-1/2 -translate-y-1/2 px-1 text-zinc-500 hover:text-zinc-800 leading-none"
        >
          ×
        </button>
      )}
    </div>
  );
}

export function ClassicTable({ children, className, testId }: { children: ReactNode; className?: string; testId?: string }) {
  return (
    <div className="bg-white border border-[#dee2e6] overflow-x-auto">
      <table data-testid={testId} className={clsx('w-full text-sm text-zinc-800 border-collapse', className)}>
        {children}
      </table>
    </div>
  );
}

export function ClassicThead({ children }: { children: ReactNode }) {
  return <thead className="bg-[#e9ecef] text-zinc-700">{children}</thead>;
}

/** Striped, hoverable body rows. */
export function ClassicTbody({ children }: { children: ReactNode }) {
  return (
    <tbody className="[&>tr:nth-child(even)]:bg-[#f8f9fa] [&>tr:hover]:bg-[#eef3f8]">
      {children}
    </tbody>
  );
}

export function ClassicTh({
  sortable, active, dir, onSort, numeric, center, className, children, ...rest
}: ThHTMLAttributes<HTMLTableCellElement> & {
  sortable?: boolean; active?: boolean; dir?: 'asc' | 'desc'; onSort?: () => void;
  numeric?: boolean; center?: boolean;
}) {
  const align = center ? 'text-center' : numeric ? 'text-end' : 'text-start';
  const base = clsx('px-2 py-1.5 font-semibold border-b border-[#dee2e6] align-bottom whitespace-nowrap', align, className);
  if (!sortable) return <th {...rest} className={base}>{children}</th>;
  return (
    <th {...rest} className={base} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={onSort} className={clsx('inline-flex items-center gap-1 hover:underline', active && 'text-[#337ab7]')}>
        {children}
        <span aria-hidden className="text-[10px] text-zinc-400">{active ? (dir === 'asc' ? '▲' : '▼') : '⇵'}</span>
      </button>
    </th>
  );
}

export function ClassicTd({ numeric, center, className, children, ...rest }:
  React.TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean; center?: boolean }) {
  return (
    <td
      {...rest}
      className={clsx('px-2 py-1.5 border-b border-[#dee2e6] align-middle', center ? 'text-center' : numeric ? 'text-end tabular-nums' : 'text-start', className)}
    >
      {children}
    </td>
  );
}

/** Bootstrap-table footer: count, rows-per-page, numbered pages, jump-to. */
export function ClassicPager({
  page, pageSize, total, totalPages, pageSizeOptions, onPage, onPageSize, shown,
}: {
  page: number; pageSize: number; total: number; totalPages: number;
  pageSizeOptions: readonly number[]; onPage: (n: number) => void; onPageSize: (n: number) => void;
  /** Rows actually on this page (after page-local filters). */
  shown?: number;
}) {
  const { t } = useTranslation();
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = total === 0 ? 0 : Math.min(total, (page - 1) * pageSize + (shown ?? pageSize));
  const numbers = pageNumbers(page, totalPages);
  const btn = 'min-w-[2rem] px-2 py-1 text-sm border border-[#dee2e6] -ms-px first:ms-0';
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm text-zinc-700">
      <div className="flex items-center gap-2">
        <span>{t('Showing {{from}} to {{to}} of {{total}} rows', { from, to, total })}</span>
        <select
          aria-label={t('Rows per page')}
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          className={clsx(classicSelect, 'py-0.5 font-semibold text-[#337ab7]')}
        >
          {pageSizeOptions.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <span>{t('rows per page')}</span>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <div className="inline-flex">
            <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label={t('Previous page')} className={clsx(btn, 'rounded-s-sm disabled:opacity-40 hover:bg-zinc-100')}>‹</button>
            {numbers.map((n, i) => n === null ? (
              <span key={`gap-${i}`} className={clsx(btn, 'text-zinc-400')}>…</span>
            ) : (
              <button
                key={n}
                type="button"
                onClick={() => onPage(n)}
                aria-current={n === page ? 'page' : undefined}
                aria-label={t('Go to page {{page}}', { page: n })}
                className={clsx(btn, n === page ? 'bg-[#337ab7] border-[#337ab7] text-white' : 'text-[#337ab7] hover:bg-zinc-100')}
              >
                {n}
              </button>
            ))}
            <button type="button" onClick={() => onPage(page + 1)} disabled={page >= totalPages} aria-label={t('Next page')} className={clsx(btn, 'rounded-e-sm disabled:opacity-40 hover:bg-zinc-100')}>›</button>
          </div>
          <JumpTo page={page} totalPages={totalPages} onJump={onPage} />
        </div>
      )}
    </div>
  );
}

function JumpTo({ page, totalPages, onJump }: { page: number; totalPages: number; onJump: (n: number) => void }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(String(page));
  useEffect(() => { setValue(String(page)); }, [page]);
  const submit = () => {
    // Clamp rather than reject: legacy's GO takes you to the nearest valid
    // page. (`min`/`max` attributes here would make the browser block submit
    // and the button would appear dead.)
    const n = Math.round(Number(value));
    if (Number.isFinite(n) && value.trim() !== '') {
      const target = Math.min(Math.max(n, 1), Math.max(totalPages, 1));
      if (target !== page) onJump(target);
      else setValue(String(page));
    } else {
      setValue(String(page));
    }
  };
  return (
    <form
      role="search"
      aria-label={t('Jump to page')}
      onSubmit={(e) => { e.preventDefault(); submit(); }}
      className="inline-flex"
    >
      <input
        type="number"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label={t('Jump to page')}
        className={clsx(classicInput, 'w-16 rounded-e-none text-center')}
      />
      <button type="submit" className="px-3 py-1 text-sm font-semibold bg-[#337ab7] text-white border border-[#2e6da4] rounded-e-sm hover:bg-[#286090]">
        {t('GO')}
      </button>
    </form>
  );
}

/** Page title strip used above classic tables. */
export function ClassicPageTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h1 className="text-xl font-semibold text-zinc-800">{children}</h1>
      {actions}
    </div>
  );
}

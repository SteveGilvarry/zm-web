import type { ButtonHTMLAttributes, ReactNode, TableHTMLAttributes, ThHTMLAttributes } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';

/**
 * Flat-Bootstrap primitives for the classic Options pages: square grey
 * buttons, the blue primary, white striped tables with sortable headers.
 * Colours are hard-coded on purpose — this is the legacy look, not the
 * token set, and it must not drift with the modern theme.
 */

type Tone = 'default' | 'primary' | 'danger';

export function ClassicButton({
  tone = 'default',
  className,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return (
    <button
      type={type}
      className={clsx(
        'inline-flex items-center gap-1 px-3 py-1 text-sm rounded-sm border leading-5',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        tone === 'default' && 'bg-zinc-100 border-zinc-400 text-zinc-800 hover:bg-zinc-200',
        tone === 'primary' && 'bg-[#337ab7] border-[#2e6da4] text-white hover:bg-[#286090]',
        tone === 'danger' && 'bg-[#d9534f] border-[#d43f3a] text-white hover:bg-[#c9302c]',
        className,
      )}
      {...rest}
    />
  );
}

/** Legacy bootstrap-table toolbar row: verbs on the start side, search on the end. */
export function ClassicToolbar({ children, end }: { children: ReactNode; end?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {children}
      {end && <div className="ms-auto flex items-center gap-2">{end}</div>}
    </div>
  );
}

export function ClassicSearch({
  value,
  onChange,
  placeholder,
}: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const { t } = useTranslation();
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder ?? t('Search')}
      aria-label={placeholder ?? t('Search')}
      className="w-56 px-2 py-1 text-sm bg-white border border-zinc-400 rounded-sm text-zinc-900 focus:outline-none focus:border-zinc-600"
    />
  );
}

export function ClassicTable({ className, ...rest }: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="bg-white rounded-sm border border-zinc-300 overflow-x-auto">
      <table
        className={clsx('w-full text-sm text-zinc-800 [&_tbody_tr:nth-child(odd)]:bg-zinc-50 [&_tbody_tr:hover]:bg-[#f5f5f5]', className)}
        {...rest}
      />
    </div>
  );
}

export const classicTh = 'px-3 py-2 text-start font-semibold text-xs bg-zinc-100 border-b border-zinc-300 whitespace-nowrap';
export const classicTd = 'px-3 py-1.5 border-b border-zinc-200 align-middle';
export const classicLink = 'text-[#337ab7] hover:underline';
export const classicInput = 'px-2 py-1 text-sm bg-white border border-zinc-400 rounded-sm text-zinc-900 focus:outline-none focus:border-zinc-600';

/** Sortable header cell with the bootstrap-table caret. */
export function ClassicSortTh({
  active,
  dir,
  onClick,
  children,
  className,
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement> & { active: boolean; dir: 'asc' | 'desc'; onClick: () => void }) {
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={clsx(classicTh, 'cursor-pointer select-none', className)}
      {...rest}
    >
      <button type="button" onClick={onClick} className="inline-flex items-center gap-1 font-semibold">
        {children}
        <span aria-hidden className={clsx('text-[10px]', active ? 'text-zinc-700' : 'text-zinc-400')}>
          {active ? (dir === 'asc' ? '▲' : '▼') : '⇅'}
        </span>
      </button>
    </th>
  );
}

/** `Yes` / `No` for the legacy capability columns. */
export function YesNo({ value }: { value: number | null | undefined }) {
  const { t } = useTranslation();
  return <>{value ? t('Yes') : t('No')}</>;
}

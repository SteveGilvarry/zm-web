import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { CLASSIC_PAGE_SIZES, PAGE_SIZE_ALL, pageCount, pageNumbers, pageWindow } from './paginationMath';

interface ClassicPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize?: (size: number) => void;
  pageSizeOptions?: readonly number[];
  className?: string;
}

/**
 * bootstrap-table footer: "Showing 1 to 25 of 120 rows", the page-size
 * dropdown and the page list.
 */
export function ClassicPagination({
  page, pageSize, total, onPage, onPageSize, pageSizeOptions = CLASSIC_PAGE_SIZES, className,
}: ClassicPaginationProps) {
  const { t } = useTranslation();
  const pages = pageCount(total, pageSize);
  const { from, to } = pageWindow(page, pageSize, total);
  const btn = (active = false) =>
    clsx(
      'min-w-8 h-8 px-2 text-sm border border-zinc-300 -ms-px first:ms-0',
      active ? 'bg-[#337ab7] border-[#337ab7] text-white' : 'bg-white text-[#337ab7] hover:bg-zinc-100',
      'disabled:text-zinc-400 disabled:bg-zinc-50 disabled:cursor-not-allowed',
    );
  return (
    <div className={clsx('flex flex-wrap items-center justify-between gap-3 py-2 text-sm text-zinc-700', className)}>
      <div className="flex items-center gap-2">
        <span>{t('Showing {{from}} to {{to}} of {{total}} rows', { from, to, total })}</span>
        {onPageSize && (
          <label className="inline-flex items-center gap-1">
            <select
              value={pageSize}
              onChange={(e) => onPageSize(Number(e.target.value))}
              aria-label={t('Rows per page')}
              className="rounded-sm border border-zinc-400 bg-white px-1 py-0.5 text-sm"
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
              <option value={PAGE_SIZE_ALL}>{t('All')}</option>
            </select>
            <span>{t('rows per page')}</span>
          </label>
        )}
      </div>
      {pages > 1 && (
        <nav aria-label={t('Pagination')} className="flex items-center">
          <button type="button" className={btn()} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t('Previous page')}>
            ‹
          </button>
          {pageNumbers(page, pages).map((n, i) =>
            n === '…' ? (
              <span key={`gap-${i}`} className={clsx(btn(), 'inline-flex items-center justify-center')} aria-hidden>…</span>
            ) : (
              <button
                key={n}
                type="button"
                className={btn(n === page)}
                aria-current={n === page ? 'page' : undefined}
                onClick={() => onPage(n)}
              >
                {n}
              </button>
            ),
          )}
          <button type="button" className={btn()} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label={t('Next page')}>
            ›
          </button>
        </nav>
      )}
    </div>
  );
}

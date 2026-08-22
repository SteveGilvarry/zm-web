export const CLASSIC_PAGE_SIZES: readonly number[] = [10, 25, 50, 100, 200];
/** Sentinel page size meaning "every row on one page" (bootstrap-table `All`). */
export const PAGE_SIZE_ALL = 0;

export function pageCount(total: number, pageSize: number): number {
  if (pageSize === PAGE_SIZE_ALL) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Row window (1-based, inclusive) for "Showing X to Y of Z rows". */
export function pageWindow(page: number, pageSize: number, total: number): { from: number; to: number } {
  if (total === 0) return { from: 0, to: 0 };
  if (pageSize === PAGE_SIZE_ALL) return { from: 1, to: total };
  const from = (page - 1) * pageSize + 1;
  return { from, to: Math.min(total, from + pageSize - 1) };
}

/** Page numbers to offer: first, last and a window of two around the current page. */
export function pageNumbers(page: number, pages: number): Array<number | '…'> {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set<number>([1, pages, page - 1, page, page + 1]);
  const nums = [...set].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: Array<number | '…'> = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1] > 1) out.push('…');
    out.push(n);
  });
  return out;
}

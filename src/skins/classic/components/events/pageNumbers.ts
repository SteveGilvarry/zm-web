/** 1 … 4 5 [6] 7 8 … 20 — bootstrap-table's page window. */
export function pageNumbers(page: number, totalPages: number): Array<number | null> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const out: Array<number | null> = [1];
  const lo = Math.max(2, page - 2);
  const hi = Math.min(totalPages - 1, page + 2);
  if (lo > 2) out.push(null);
  for (let n = lo; n <= hi; n++) out.push(n);
  if (hi < totalPages - 1) out.push(null);
  out.push(totalPages);
  return out;
}

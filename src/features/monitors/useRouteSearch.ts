import { useSearch } from '@tanstack/react-router';

/**
 * The current route's validated search params as a loose record. Page hooks
 * read legacy-compat params (`monitor_id`, `edit`, `new`, `group`, …) through
 * this so they stay usable from any route (the Watch page hosts the cycle
 * sidebar, the classic Console hosts the Add dialog).
 */
export function useRouteSearch(): Record<string, unknown> {
  // `strict: false` is the documented way to read search from a shared
  // component; the union type it returns is widened to a record here.
  return (useSearch({ strict: false }) ?? {}) as Record<string, unknown>;
}

export function searchInt(search: Record<string, unknown>, key: string): number | undefined {
  const v = search[key];
  const n = Number(v);
  return v != null && v !== '' && Number.isInteger(n) && n > 0 ? n : undefined;
}

export function searchFlag(search: Record<string, unknown>, key: string): boolean {
  const v = search[key];
  return v === true || v === 'true' || v === 1 || v === '1';
}

export function searchString(search: Record<string, unknown>, key: string): string | undefined {
  const v = search[key];
  return typeof v === 'string' && v !== '' ? v : undefined;
}

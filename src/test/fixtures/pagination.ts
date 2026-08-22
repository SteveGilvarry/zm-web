import type { PaginatedResponse } from '@/types';

/**
 * Wrap rows in the backend's pagination envelope
 * (`{items,total,per_page,current_page,last_page}`).
 *
 *   paginated([makeMonitor()])
 *   paginated(rows, { per_page: 20, total: 137, last_page: 7 })
 *
 * `last_page` is derived from `total`/`per_page` unless given, so a fixture
 * for "page 1 of many" only has to say how many rows exist in total.
 */
export function paginated<T>(
  items: T[],
  overrides: Partial<PaginatedResponse<T>> = {},
): PaginatedResponse<T> {
  const per_page = overrides.per_page ?? 100;
  const total = overrides.total ?? items.length;
  return {
    items: overrides.items ?? items,
    total,
    per_page,
    current_page: overrides.current_page ?? 1,
    last_page: overrides.last_page ?? Math.max(1, Math.ceil(total / Math.max(1, per_page))),
  };
}

/** An empty page — the shape the backend returns when nothing matches. */
export function emptyPage<T>(overrides: Partial<PaginatedResponse<T>> = {}): PaginatedResponse<T> {
  return paginated<T>([], overrides);
}

import { useQuery } from '@tanstack/react-query';
import { getConfigs } from '@/api/configs';
import { useAuthStore } from '@/stores/auth';

/**
 * Read one ZoneMinder config row (`ZM_*`) as a typed value. Legacy UI
 * behaviour is driven by these (events page size, default sort, thumbnails,
 * alarm popup/sound, titles, date formats…); the dashboard edits them in
 * Options and, through this hook, also honours them.
 *
 * Cached for 5 minutes; `fallback` is returned while loading or on error so
 * callers never branch on undefined.
 *
 * **One request for the whole table, not one per row.** This used to
 * `GET /configs/<NAME>` per call site, so a page reading five settings made
 * five round trips — thirteen API calls to render the classic events page,
 * enough to trip zm-api's rate limiter on a real box and leave the table
 * stuck on "Loading…". Every caller now shares a single `['configs','all']`
 * query, which is also how ZoneMinder's own UI works: load the table once,
 * read from memory.
 */
export function useZmConfig<T extends string | number | boolean>(
  name: string,
  fallback: T,
): T {
  const { data } = useZmConfigTable();
  const raw = data?.[name];
  if (raw == null) return fallback;
  return coerce(raw, fallback);
}

/**
 * The whole config table as `name -> value`, fetched once and shared.
 *
 * `page_size` is deliberately larger than ZoneMinder's row count (~400) so
 * this is a single request; a second page would defeat the point.
 */
export function useZmConfigTable() {
  const { isAuthenticated } = useAuthStore();
  return useQuery({
    // Not ['configs','all'] — the Options page already owns that key with a
    // different shape (the raw row list it renders). Two queryFns under one
    // key means whichever mounts first wins and the other reads nonsense.
    queryKey: ['configs', 'lookup'],
    queryFn: async () => {
      const page = await getConfigs({ page: 1, page_size: 1000 });
      const byName: Record<string, string> = {};
      for (const row of page.items) byName[row.name] = row.value;
      return byName;
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
  });
}

export function coerce<T extends string | number | boolean>(raw: string, fallback: T): T {
  if (typeof fallback === 'number') {
    const n = Number(raw);
    return (Number.isFinite(n) ? n : fallback) as T;
  }
  if (typeof fallback === 'boolean') {
    if (raw === '1' || /^(yes|true|on)$/i.test(raw)) return true as T;
    if (raw === '0' || /^(no|false|off)$/i.test(raw)) return false as T;
    return fallback;
  }
  return (raw === '' ? fallback : raw) as T;
}

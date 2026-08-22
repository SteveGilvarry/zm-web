import { useQuery } from '@tanstack/react-query';
import { getConfig } from '@/api/configs';
import { useAuthStore } from '@/stores/auth';

/**
 * Read one ZoneMinder config row (`ZM_*`) as a typed value. Legacy UI
 * behaviour is driven by these (events page size, default sort, thumbnails,
 * alarm popup/sound, titles, date formats…); the dashboard edits them in
 * Options and, through this hook, also honours them.
 *
 * Cached for 5 minutes; `fallback` is returned while loading or on error so
 * callers never branch on undefined.
 */
export function useZmConfig<T extends string | number | boolean>(
  name: string,
  fallback: T,
): T {
  const { isAuthenticated } = useAuthStore();
  const { data } = useQuery({
    queryKey: ['config', name],
    queryFn: () => getConfig(name),
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
  });
  if (!data) return fallback;
  return coerce(data.value, fallback);
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

import { useQuery } from '@tanstack/react-query';
import { listUserPreferences } from '@/api/userPreferences';
import { useAuthStore } from '@/stores/auth';
import type { Monitor } from '@/types';

/**
 * Legacy `montagereview.php:66-80`: the wall is ordered by the user
 * preference `MontageSort<groupIds>` (a comma-separated monitor-id list),
 * falling back to plain `MontageSort` and then to the query order. Monitors
 * the preference does not name keep their place after the ones it does.
 */
export function montageSortName(groupIds: number[]): string {
  return `MontageSort${groupIds.join(',')}`;
}

/** Apply a `MontageSort` value to a monitor list. */
export function applyMontageSort(monitors: Monitor[], value: string | null | undefined): Monitor[] {
  if (!value) return monitors;
  const order = value.split(',').map((v) => Number(v.trim())).filter((n) => Number.isInteger(n) && n > 0);
  if (order.length === 0) return monitors;
  const byId = new Map(monitors.map((m) => [m.id, m]));
  const picked = order.map((id) => byId.get(id)).filter((m): m is Monitor => !!m);
  const seen = new Set(picked.map((m) => m.id));
  return [...picked, ...monitors.filter((m) => !seen.has(m.id))];
}

/**
 * The stored order for the groups in play, or null while it loads / when the
 * user has never saved one.
 */
export function useMontageSort(groupIds: number[]): string | null {
  const { isAuthenticated } = useAuthStore();
  const q = useQuery({
    queryKey: ['userPreferences'],
    queryFn: () => listUserPreferences({ page: 1, page_size: 200 }),
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
  });
  const rows = q.data?.items ?? [];
  const wanted = montageSortName(groupIds);
  const exact = rows.find((r) => r.name === wanted);
  const generic = rows.find((r) => r.name === 'MontageSort');
  return (exact ?? generic)?.value ?? null;
}

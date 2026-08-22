import { useQuery } from '@tanstack/react-query';
import { listMonitorPresets, type MonitorPreset } from '@/api/monitorPresets';
import { useAuthStore } from '@/stores/auth';

/** Every monitor preset, for the Add dialog's picker. Cached; the table is seed data. */
export function usePresets(enabled = true): { presets: MonitorPreset[]; isLoading: boolean; isError: boolean } {
  const { isAuthenticated } = useAuthStore();
  const q = useQuery({
    queryKey: ['monitor_presets'],
    queryFn: () => listMonitorPresets({ page: 1, page_size: 500 }),
    enabled: enabled && isAuthenticated,
    staleTime: 10 * 60_000,
  });
  return { presets: q.data?.items ?? [], isLoading: q.isLoading, isError: q.isError };
}
